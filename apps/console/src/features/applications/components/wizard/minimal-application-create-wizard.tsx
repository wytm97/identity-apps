/**
 * Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { AlertLevels, TestableComponentInterface } from "@wso2is/core/models";
import { addAlert } from "@wso2is/core/store";
import { Field, FormValue, Forms, Validation, useTrigger } from "@wso2is/forms";
import {
    ContentLoader,
    Heading,
    LinkButton,
    PrimaryButton,
    SelectionCard,
    useWizardAlert
} from "@wso2is/react-components";
import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";
import set from "lodash/set";
import React, { FunctionComponent, ReactElement, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Grid, Popup } from "semantic-ui-react";
import { OauthProtocolSettingsWizardForm } from "./oauth-protocol-settings-wizard-form";
import { SAMLProtocolSettingsWizardForm } from "./saml-protocol-settings-wizard-form";
import { ApplicationListInterface, ApplicationTemplateLoadingStrategies, getApplicationList } from "../..";
import {
    AppConstants,
    AppState,
    CORSOriginsListInterface,
    ModalWithSidePanel,
    getCORSOrigins,
    getTechnologyLogos,
    history,
    store
} from "../../../core";
import { createApplication, getApplicationTemplateData } from "../../api";
import { getInboundProtocolLogos } from "../../configs";
import { ApplicationManagementConstants } from "../../constants";
import CustomApplicationTemplate
    from "../../data/application-templates/templates/custom-application/custom-application.json";
import { ApplicationTemplateInterface, MainApplicationInterface, SupportedAuthProtocolTypes } from "../../models";

/**
 * Prop types of the `MinimalAppCreateWizard` component.
 */
interface MinimalApplicationCreateWizardPropsInterface extends TestableComponentInterface {
    title: string;
    closeWizard: () => void;
    template?: ApplicationTemplateInterface;
    subTitle?: string;
    addProtocol: boolean;
    selectedProtocols?: string[];
    subTemplates?: ApplicationTemplateInterface[];
    subTemplatesSectionTitle?: string;
    appId?: string;
    /**
     * Callback to update the application details.
     */
    onUpdate?: (id: string) => void;
    /**
     * Flag to show/hide help panel.
     */
    showHelpPanel?: boolean;
    /**
     * Application template loading strategy.
     */
    templateLoadingStrategy: ApplicationTemplateLoadingStrategies;
}

/**
 * An app creation wizard with only the minimal features.
 *
 * @param {MinimalApplicationCreateWizardPropsInterface} props Props to be injected into the component.
 */
export const MinimalAppCreateWizard: FunctionComponent<MinimalApplicationCreateWizardPropsInterface> = (
    props: MinimalApplicationCreateWizardPropsInterface
): ReactElement => {

    const {
        title,
        closeWizard,
        template,
        showHelpPanel,
        subTemplates,
        subTemplatesSectionTitle,
        subTitle,
        templateLoadingStrategy,
        [ "data-testid" ]: testId
    } = props;

    const { t } = useTranslation();

    const dispatch = useDispatch();

    const tenantName = store.getState().config.deployment.tenant;

    const [ submit, setSubmit ] = useTrigger();
    const [ submitProtocolForm, setSubmitProtocolForm ] = useTrigger();

    const isClientSecretHashEnabled: boolean = useSelector((state: AppState) =>
        state.config.ui.isClientSecretHashEnabled);

    const [ templateSettings, setTemplateSettings ] = useState<ApplicationTemplateInterface>(null);
    const [ protocolFormValues, setProtocolFormValues ] = useState<object>(undefined);
    const [ generalFormValues, setGeneralFormValues ] = useState<Map<string, FormValue>>(undefined);
    const [ selectedTemplate, setSelectedTemplate ] = useState<ApplicationTemplateInterface>(template);
    const [ allowedOrigins, setAllowedOrigins ] = useState([]);

    const [ alert, setAlert, notification ] = useWizardAlert();

    useEffect(() => {
        // Stop fetching CORS origins if the selected template is `Expert Mode`.
        if (!selectedTemplate || selectedTemplate.id === CustomApplicationTemplate.id) {
            return;
        }

        const allowedCORSOrigins = [];
        getCORSOrigins()
            .then((response: CORSOriginsListInterface[]) => {
                response.map((origin) => {
                    allowedCORSOrigins.push(origin.url);
                });
            });

        setAllowedOrigins(allowedCORSOrigins);

        // Remove error alert on protocol switch
        setAlert(null);
    }, [ selectedTemplate ]);

    /**
     * On sub-template change set the selected template to the first,
     * and load template details.
     */
    useEffect(() => {
        // Stop fetching template details if the selected template is `Expert Mode`.
        if (selectedTemplate.id === CustomApplicationTemplate.id) {
            setTemplateSettings(CustomApplicationTemplate);
            return;
        }

        if (isEmpty(subTemplates) || !Array.isArray(subTemplates) || subTemplates.length < 1) {
            loadTemplateDetails(template.id, template);
            return;
        }

        setSelectedTemplate(subTemplates[0]);
        loadTemplateDetails(subTemplates[0].id, subTemplates[0]);
    }, [ subTemplates ]);

    /**
     * This where the form submission happens. When the submit is triggered on the
     * main form, it triggers the submit of the protocol form.
     */
    useEffect(() => {
        if ((!protocolFormValues
            && (template?.authenticationProtocol || template.subTemplates?.length > 0))
            || !generalFormValues) {
            return;
        }

        // Get a clone to avoid mutation.
        const templateSettingsClone = cloneDeep(templateSettings);

        /**
         * Remove the default(provided by the template) callbackURLs & allowed origins from the
         * form values if theres any user defined values in the form. We do this to prevent appending
         * the default `callbackURL` to the model. {@code callbackURLs?.filter(Boolean)} ensures
         * the passing value has no undefined or falsy values so that {@code isEmpty()} call returns a clean check.
         *
         * If you check the file [single-page-application.json] you can see that there's default
         * value is already populated.
         */
        const callbackURLsPathKey = "inboundProtocolConfiguration.oidc.callbackURLs";
        const allowedOriginsPathKey = "inboundProtocolConfiguration.oidc.allowedOrigins";
        const callbackURLs = get(protocolFormValues, callbackURLsPathKey, []);

        if (!isEmpty(callbackURLs?.filter(Boolean))) {
            set(templateSettingsClone, `application.${ callbackURLsPathKey }`, []);
            set(templateSettingsClone, `application.${ allowedOriginsPathKey }`, []);
        }

        const application: MainApplicationInterface = merge(templateSettingsClone?.application, protocolFormValues);

        application.name = generalFormValues.get("name").toString();
        application.templateId = selectedTemplate.id;

        createApplication(application)
            .then((response) => {
                dispatch(
                    addAlert({
                        description: t(
                            "console:develop.features.applications.notifications." +
                            "addApplication.success.description"
                        ),
                        level: AlertLevels.SUCCESS,
                        message: t(
                            "console:develop.features.applications.notifications." +
                            "addApplication.success.message"
                        )
                    })
                );

                // The created resource's id is sent as a location header.
                // If that's available, navigate to the edit page.
                if (!isEmpty(response.headers.location)) {
                    const location = response.headers.location;
                    const createdAppID = location.substring(location.lastIndexOf("/") + 1);

                    let searchParams: string = `?${
                        ApplicationManagementConstants.APP_STATE_URL_SEARCH_PARAM_KEY }=${
                        ApplicationManagementConstants.APP_STATE_URL_SEARCH_PARAM_VALUE
                        }`;

                    if (isClientSecretHashEnabled) {
                        searchParams = `${ searchParams }&${
                            ApplicationManagementConstants.CLIENT_SECRET_HASH_ENABLED_URL_SEARCH_PARAM_KEY }=true`;
                    }

                    history.push({
                        pathname: AppConstants.getPaths().get("APPLICATION_EDIT")
                            .replace(":id", createdAppID),
                        search: searchParams
                    });

                    return;
                }

                // Fallback to applications page, if the location header is not present.
                history.push(AppConstants.getPaths().get("APPLICATIONS"));
            })
            .catch((error) => {
                if (error.response && error.response.data && error.response.data.description) {
                    setAlert({
                        description: error.response.data.description,
                        level: AlertLevels.ERROR,
                        message: t(
                            "console:develop.features.applications.notifications." +
                            "addApplication.error.message"
                        )
                    });
                    scrollToNotification();

                    return;
                }

                setAlert({
                    description: t(
                        "console:develop.features.applications.notifications." +
                        "addApplication.genericError.description"
                    ),
                    level: AlertLevels.ERROR,
                    message: t(
                        "console:develop.features.applications.notifications." +
                        "addApplication.genericError.message"
                    )
                });
                scrollToNotification();
            });
    }, [ protocolFormValues, generalFormValues ]);

    /**
     * Close the wizard.
     */
    const handleWizardClose = (): void => {
        closeWizard();
    };

    /**
     * Load application template data.
     */
    const loadTemplateDetails = (id: string, template: ApplicationTemplateInterface): void => {

        // If the loading strategy is `LOCAL`, stop making the GET request to fetch template details.
        if (templateLoadingStrategy === ApplicationTemplateLoadingStrategies.LOCAL) {
            setTemplateSettings(template);

            return;
        }

        getApplicationTemplateData(id)
            .then((response: ApplicationTemplateInterface) => {
                setTemplateSettings(response);
            })
            .catch((error) => {
                if (error.response && error.response.data && error.response.data.description) {
                    dispatch(
                        addAlert({
                            description: error.response.data.description,
                            level: AlertLevels.ERROR,
                            message: t(
                                "console:develop.features.applications.notifications.fetchTemplate.error.message"
                            )
                        })
                    );

                    return;
                }
                dispatch(
                    addAlert({
                        description: t(
                            "console:develop.features.applications.notifications.fetchTemplate" +
                            ".genericError.description"
                        ),
                        level: AlertLevels.ERROR,
                        message: t(
                            "console:develop.features.applications.notifications.fetchTemplate.genericError.message"
                        )
                    })
                );
            });
    };

    /**
     * Resolves the relevant protocol form based on the selected protocol.
     *
     * @return {any}
     */
    const resolveMinimalProtocolFormFields = (): ReactElement => {
        if (selectedTemplate.authenticationProtocol === SupportedAuthProtocolTypes.OIDC) {
            return (
                <OauthProtocolSettingsWizardForm
                    isProtocolConfig={ false }
                    tenantDomain={ tenantName }
                    allowedOrigins={ allowedOrigins }
                    fields={ [ "callbackURLs" ] }
                    hideFieldHints={ true }
                    triggerSubmit={ submitProtocolForm }
                    templateValues={ templateSettings?.application }
                    onSubmit={ (values): void => setProtocolFormValues(values) }
                    showCallbackURL={ true }
                    data-testid={ `${ testId }-oauth-protocol-settings-form` }
                />
            );
        } else if (selectedTemplate.authenticationProtocol === SupportedAuthProtocolTypes.SAML) {
            return (
                <SAMLProtocolSettingsWizardForm
                    fields={ [ "issuer", "assertionConsumerURLs" ] }
                    hideFieldHints={ true }
                    triggerSubmit={ submitProtocolForm }
                    templateValues={ templateSettings?.application }
                    onSubmit={ (values): void => setProtocolFormValues(values) }
                    data-testid={ `${ testId }-saml-protocol-settings-form` }
                />
            );
        }
    };

    const scrollToNotification = () => {
        document.getElementById("notification-div").scrollIntoView({ behavior: "smooth" });
    };

    const isNameValid = (name: string) => {
        return name && !!name.match(ApplicationManagementConstants.FORM_FIELD_CONSTRAINTS.APP_NAME_PATTERN);
    };

    /**
     * Resolves to the applicable content of an application template.
     *
     * @return {ReactElement} The content relevant to a specified application template.
     */
    const resolveContent = (): ReactElement => {
        return (
            <Forms
                onSubmit={ (values: Map<string, FormValue>) => {
                    setGeneralFormValues(values);
                    setSubmitProtocolForm();
                } }
                submitState={ submit }
                id="name-input"
            >
                <Grid>
                    <div id="notification-div">
                        { alert && (
                            <Grid.Row columns={ 1 }>
                                <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                                    { notification }
                                </Grid.Column>
                            </Grid.Row>
                        ) }
                    </div>
                    <Grid.Row columns={ 1 }>
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                            <Field
                                name="name"
                                label={ t(
                                    "console:develop.features.applications.forms.generalDetails.fields.name.label"
                                ) }
                                required={ true }
                                requiredErrorMessage={ t(
                                    "console:develop.features.applications.forms.generalDetails.fields.name" +
                                    ".validations.empty"
                                ) }
                                placeholder={ t(
                                    "console:develop.features.applications.forms.generalDetails.fields.name.placeholder"
                                ) }
                                type="text"
                                data-testid={ `${ testId }-application-name-input` }
                                validation={ async (value: FormValue, validation: Validation) => {
                                    if(!isNameValid(value.toString())) {
                                        validation.isValid = false;
                                        validation.errorMessages.push(
                                            t("console:develop.features.applications.forms." +
                                                "spaProtocolSettingsWizard.fields.name.validations.invalid",
                                                { appName: value.toString(),
                                                    characterLimit: ApplicationManagementConstants
                                                        .FORM_FIELD_CONSTRAINTS.APP_NAME_MAX_LENGTH }
                                            )
                                        );

                                        return;
                                    }
                                    let response: ApplicationListInterface = null;
                                    try {
                                        response = await getApplicationList(null, null, "name eq " + value.toString());
                                    } catch (error) {
                                        if (error.response && error.response.data && error.response.data.description) {
                                            dispatch(addAlert({
                                                description: error.response.data.description,
                                                level: AlertLevels.ERROR,
                                                message: t("console:develop.features.applications." +
                                                    "notifications.fetchApplications.error.message")
                                            }));

                                            return;
                                        }

                                        dispatch(addAlert({
                                            description: t("console:develop.features.applications.notifications." +
                                                "fetchApplications.genericError.description"),
                                            level: AlertLevels.ERROR,
                                            message: t("console:develop.features.applications.notifications." +
                                                "fetchApplications.genericError.message")
                                        }));
                                    }

                                    if (response?.applications?.length > 0) {
                                        validation.isValid = false;
                                        validation.errorMessages.push(
                                            t("console:develop.features.applications.forms.generalDetails.fields.name" +
                                                ".validations.duplicate" )
                                        );
                                    }
                                } }
                                maxLength={ ApplicationManagementConstants.FORM_FIELD_CONSTRAINTS.APP_NAME_MAX_LENGTH }
                            />
                        </Grid.Column>
                    </Grid.Row>
                    {
                        (subTemplates && subTemplates instanceof Array && subTemplates.length > 0)
                            ? (
                                <Grid.Row className="pt-0">
                                    <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                                        <div className="sub-template-selection">
                                            <div>{ subTemplatesSectionTitle }</div>
                                            {
                                                subTemplates.map((
                                                    subTemplate: ApplicationTemplateInterface, index: number
                                                ) => (
                                                    <Popup
                                                        key={ index }
                                                        trigger={
                                                            <SelectionCard
                                                                inline
                                                                key={ index }
                                                                image={
                                                                    {
                                                                        ...getInboundProtocolLogos(),
                                                                        ...getTechnologyLogos()
                                                                    }[ subTemplate.image ]
                                                                }
                                                                size="x120"
                                                                className="sub-template-selection-card"
                                                                header={ subTemplate.name }
                                                                selected={ selectedTemplate.id === subTemplate.id }
                                                                onClick={ () => {
                                                                    if (!subTemplate.previewOnly) {
                                                                        setSelectedTemplate(subTemplate);
                                                                        loadTemplateDetails(subTemplate.id,
                                                                            subTemplate);
                                                                    }
                                                                } }
                                                                imageSize="mini"
                                                                contentTopBorder={ false }
                                                                showTooltips={ !subTemplate.previewOnly }
                                                                disabled={ subTemplate.previewOnly }
                                                                data-testid={ `${ testId }-${ subTemplate.id }-card` }
                                                            />
                                                        }
                                                        content={
                                                            t("common:comingSoon" )
                                                        }
                                                        inverted
                                                        position="top center"
                                                        size="mini"
                                                        disabled={ !subTemplate.previewOnly }
                                                    />
                                                ))
                                            }
                                        </div>
                                    </Grid.Column>
                                </Grid.Row>
                            )
                            : null
                    }
                    <Grid.Row className="pt-0">
                        <Grid.Column mobile={ 16 } tablet={ 16 } computer={ 14 }>
                            { resolveMinimalProtocolFormFields() }
                        </Grid.Column>
                    </Grid.Row>
                </Grid>
            </Forms>
        );
    };

    /**
     * Renders the help panel containing wizard help.
     *
     * @return {React.ReactElement}
     */
    const renderHelpPanel = (): ReactElement => {

        // Return null when `showHelpPanel` is false or `wizardHelp` is not defined in `selectedTemplate` object.
        if (!selectedTemplate?.content?.wizardHelp) {
            return null;
        }

        const {
            wizardHelp: WizardHelp
        } = selectedTemplate.content;

        return (
            <ModalWithSidePanel.SidePanel>
                <ModalWithSidePanel.Header className="wizard-header help-panel-header muted">
                    <div className="help-panel-header-text">
                        { t("console:develop.features.applications.wizards.minimalAppCreationWizard.help.heading") }
                    </div>
                </ModalWithSidePanel.Header>
                <ModalWithSidePanel.Content>
                    <Suspense fallback={ <ContentLoader /> }>
                        <WizardHelp />
                    </Suspense>
                </ModalWithSidePanel.Content>
            </ModalWithSidePanel.SidePanel>
        );
    };

    return (
        <ModalWithSidePanel
            open={ true }
            className="wizard minimal-application-create-wizard"
            dimmer="blurring"
            onClose={ handleWizardClose }
            closeOnDimmerClick={ false }
            closeOnEscape
            data-testid={ `${ testId }-modal` }
        >
            <ModalWithSidePanel.MainPanel>
                <ModalWithSidePanel.Header className="wizard-header">
                    { title }
                    { subTitle && <Heading as="h6">{ subTitle }</Heading> }
                </ModalWithSidePanel.Header>
                <ModalWithSidePanel.Content>{ resolveContent() }</ModalWithSidePanel.Content>
                <ModalWithSidePanel.Actions>
                    <Grid>
                        <Grid.Row column={ 1 }>
                            <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                                <LinkButton floated="left" onClick={ handleWizardClose }>
                                    { t("common:cancel") }
                                </LinkButton>
                            </Grid.Column>
                            <Grid.Column mobile={ 8 } tablet={ 8 } computer={ 8 }>
                                <PrimaryButton
                                    floated="right"
                                    onClick={ () => {
                                        setSubmit();
                                    } }
                                    data-testid={ `${ testId }-next-button` }
                                >
                                    { t("common:register") }
                                </PrimaryButton>
                            </Grid.Column>
                        </Grid.Row>
                    </Grid>
                </ModalWithSidePanel.Actions>
            </ModalWithSidePanel.MainPanel>
            { renderHelpPanel() }
        </ModalWithSidePanel>
    );
};

/**
 * Default props for the application creation wizard.
 */
MinimalAppCreateWizard.defaultProps = {
    "data-testid": "minimal-application-create-wizard",
    showHelpPanel: true
};
