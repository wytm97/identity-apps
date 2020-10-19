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

import { Confirmation, ModalInterface, Notification, ValidationInterface } from "../common";

/**
 * Model for the Console namespace
 */
export interface ConsoleNS {
    common: {
        modals: {
            editAvatarModal: ModalInterface;
            sessionTimeoutModal: ModalInterface;
        };
        validations: {
            inSecureURL: ValidationInterface;
            unrecognizedURL: ValidationInterface;
        };
    };
    manage: {
        features: {
            users: {
                confirmations: {
                    terminateAllSessions: Confirmation;
                    terminateSession: Confirmation;
                };
                editUser: {
                    tab: {
                        menuItems: {
                            0: string;
                            1: string;
                            2: string;
                            3: string;
                        };
                    };
                };
                userSessions: {
                    notifications: {
                        getUserSessions: Notification;
                        terminateAllUserSessions: Notification;
                        terminateUserSession: Notification;
                    };
                };
            };
        };
    };
}
