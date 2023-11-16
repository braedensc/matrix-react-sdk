/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2018 New Vector Ltd
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import * as React from "react";
import { User, IContent, Direction, ContentHelpers, MRoomTopicEventContent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import dis from "./dispatcher/dispatcher";
import { _t, _td, UserFriendlyError } from "./languageHandler";
import Modal from "./Modal";
import MultiInviter from "./utils/MultiInviter";
import { Linkify, topicToHtml } from "./HtmlUtils";
import QuestionDialog from "./components/views/dialogs/QuestionDialog";
import WidgetUtils from "./utils/WidgetUtils";
import { textToHtmlRainbow } from "./utils/colour";
import { AddressType, getAddressType } from "./UserAddress";
import { abbreviateUrl } from "./utils/UrlUtils";
import { getDefaultIdentityServerUrl, setToDefaultIdentityServer } from "./utils/IdentityServerUtils";
import { WidgetType } from "./widgets/WidgetType";
import { Jitsi } from "./widgets/Jitsi";
import BugReportDialog from "./components/views/dialogs/BugReportDialog";
import { ensureDMExists } from "./createRoom";
import { ViewUserPayload } from "./dispatcher/payloads/ViewUserPayload";
import { Action } from "./dispatcher/actions";
import SdkConfig from "./SdkConfig";
import SettingsStore from "./settings/SettingsStore";
import { UIComponent, UIFeature } from "./settings/UIFeature";
import { CHAT_EFFECTS } from "./effects";
import LegacyCallHandler from "./LegacyCallHandler";
import { guessAndSetDMRoom } from "./Rooms";
import { upgradeRoom } from "./utils/RoomUpgrade";
import DevtoolsDialog from "./components/views/dialogs/DevtoolsDialog";
import RoomUpgradeWarningDialog from "./components/views/dialogs/RoomUpgradeWarningDialog";
import InfoDialog from "./components/views/dialogs/InfoDialog";
import SlashCommandHelpDialog from "./components/views/dialogs/SlashCommandHelpDialog";
import { shouldShowComponent } from "./customisations/helpers/UIComponents";
import { TimelineRenderingType } from "./contexts/RoomContext";
import { ViewRoomPayload } from "./dispatcher/payloads/ViewRoomPayload";
import VoipUserMapper from "./VoipUserMapper";
import { htmlSerializeFromMdIfNeeded } from "./editor/serialize";
import { leaveRoomBehaviour } from "./utils/leave-behaviour";
import { MatrixClientPeg } from "./MatrixClientPeg";
import { getDeviceCryptoInfo } from "./utils/crypto/deviceInfo";
import { isCurrentLocalRoom, reject, singleMxcUpload, success, successSync } from "./slash-commands/utils";
import { deop, op } from "./slash-commands/op";
import { CommandCategories } from "./slash-commands/interface";
import { Command } from "./slash-commands/command";
import { goto, join } from "./slash-commands/join";

export { CommandCategories, Command };

export const Commands = [
    new Command({
        command: "spoiler",
        args: "<message>",
        description: _td("slash_command|spoiler"),
        runFn: function (cli, roomId, threadId, message = "") {
            return successSync(ContentHelpers.makeHtmlMessage(message, `<span data-mx-spoiler>${message}</span>`));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "shrug",
        args: "<message>",
        description: _td("slash_command|shrug"),
        runFn: function (cli, roomId, threadId, args) {
            let message = "¯\\_(ツ)_/¯";
            if (args) {
                message = message + " " + args;
            }
            return successSync(ContentHelpers.makeTextMessage(message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "tableflip",
        args: "<message>",
        description: _td("slash_command|tableflip"),
        runFn: function (cli, roomId, threadId, args) {
            let message = "(╯°□°）╯︵ ┻━┻";
            if (args) {
                message = message + " " + args;
            }
            return successSync(ContentHelpers.makeTextMessage(message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "unflip",
        args: "<message>",
        description: _td("slash_command|unflip"),
        runFn: function (cli, roomId, threadId, args) {
            let message = "┬──┬ ノ( ゜-゜ノ)";
            if (args) {
                message = message + " " + args;
            }
            return successSync(ContentHelpers.makeTextMessage(message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "lenny",
        args: "<message>",
        description: _td("slash_command|lenny"),
        runFn: function (cli, roomId, threadId, args) {
            let message = "( ͡° ͜ʖ ͡°)";
            if (args) {
                message = message + " " + args;
            }
            return successSync(ContentHelpers.makeTextMessage(message));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "plain",
        args: "<message>",
        description: _td("slash_command|plain"),
        runFn: function (cli, roomId, threadId, messages = "") {
            return successSync(ContentHelpers.makeTextMessage(messages));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "html",
        args: "<message>",
        description: _td("slash_command|html"),
        runFn: function (cli, roomId, threadId, messages = "") {
            return successSync(ContentHelpers.makeHtmlMessage(messages, messages));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "jumptodate",
        args: "<YYYY-MM-DD>",
        description: _td("slash_command|jumptodate"),
        isEnabled: () => SettingsStore.getValue("feature_jump_to_date"),
        runFn: function (cli, roomId, threadId, args) {
            if (args) {
                return success(
                    (async (): Promise<void> => {
                        const unixTimestamp = Date.parse(args);
                        if (!unixTimestamp) {
                            throw new UserFriendlyError("slash_command|jumptodate_invalid_input", {
                                inputDate: args,
                                cause: undefined,
                            });
                        }

                        const { event_id: eventId, origin_server_ts: originServerTs } = await cli.timestampToEvent(
                            roomId,
                            unixTimestamp,
                            Direction.Forward,
                        );
                        logger.log(
                            `/timestamp_to_event: found ${eventId} (${originServerTs}) for timestamp=${unixTimestamp}`,
                        );
                        dis.dispatch<ViewRoomPayload>({
                            action: Action.ViewRoom,
                            event_id: eventId,
                            highlighted: true,
                            room_id: roomId,
                            metricsTrigger: "SlashCommand",
                            metricsViaKeyboard: true,
                        });
                    })(),
                );
            }

            return reject(this.getUsage());
        },
        category: CommandCategories.actions,
    }),
    new Command({
        command: "nick",
        args: "<display_name>",
        description: _td("slash_command|nick"),
        runFn: function (cli, roomId, threadId, args) {
            if (args) {
                return success(cli.setDisplayName(args));
            }
            return reject(this.getUsage());
        },
        category: CommandCategories.actions,
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "myroomnick",
        aliases: ["roomnick"],
        args: "<display_name>",
        description: _td("slash_command|myroomnick"),
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            if (args) {
                const ev = cli.getRoom(roomId)?.currentState.getStateEvents("m.room.member", cli.getSafeUserId());
                const content = {
                    ...(ev ? ev.getContent() : { membership: "join" }),
                    displayname: args,
                };
                return success(cli.sendStateEvent(roomId, "m.room.member", content, cli.getSafeUserId()));
            }
            return reject(this.getUsage());
        },
        category: CommandCategories.actions,
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "roomavatar",
        args: "[<mxc_url>]",
        description: _td("slash_command|roomavatar"),
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            let promise = Promise.resolve(args ?? null);
            if (!args) {
                promise = singleMxcUpload(cli);
            }

            return success(
                promise.then((url) => {
                    if (!url) return;
                    return cli.sendStateEvent(roomId, "m.room.avatar", { url }, "");
                }),
            );
        },
        category: CommandCategories.actions,
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "myroomavatar",
        args: "[<mxc_url>]",
        description: _td("slash_command|myroomavatar"),
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            const room = cli.getRoom(roomId);
            const userId = cli.getSafeUserId();

            let promise = Promise.resolve(args ?? null);
            if (!args) {
                promise = singleMxcUpload(cli);
            }

            return success(
                promise.then((url) => {
                    if (!url) return;
                    const ev = room?.currentState.getStateEvents("m.room.member", userId);
                    const content = {
                        ...(ev ? ev.getContent() : { membership: "join" }),
                        avatar_url: url,
                    };
                    return cli.sendStateEvent(roomId, "m.room.member", content, userId);
                }),
            );
        },
        category: CommandCategories.actions,
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "myavatar",
        args: "[<mxc_url>]",
        description: _td("slash_command|myavatar"),
        runFn: function (cli, roomId, threadId, args) {
            let promise = Promise.resolve(args ?? null);
            if (!args) {
                promise = singleMxcUpload(cli);
            }

            return success(
                promise.then((url) => {
                    if (!url) return;
                    return cli.setAvatarUrl(url);
                }),
            );
        },
        category: CommandCategories.actions,
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "rainbow",
        description: _td("slash_command|rainbow"),
        args: "<message>",
        runFn: function (cli, roomId, threadId, args) {
            if (!args) return reject(this.getUsage());
            return successSync(ContentHelpers.makeHtmlMessage(args, textToHtmlRainbow(args)));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "rainbowme",
        description: _td("slash_command|rainbowme"),
        args: "<message>",
        runFn: function (cli, roomId, threadId, args) {
            if (!args) return reject(this.getUsage());
            return successSync(ContentHelpers.makeHtmlEmote(args, textToHtmlRainbow(args)));
        },
        category: CommandCategories.messages,
    }),
    new Command({
        command: "help",
        description: _td("slash_command|help"),
        runFn: function () {
            Modal.createDialog(SlashCommandHelpDialog);
            return success();
        },
        category: CommandCategories.advanced,
    }),
    new Command({
        command: "whois",
        description: _td("slash_command|whois"),
        args: "<user-id>",
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, userId) {
            if (!userId || !userId.startsWith("@") || !userId.includes(":")) {
                return reject(this.getUsage());
            }

            const member = cli.getRoom(roomId)?.getMember(userId);
            dis.dispatch<ViewUserPayload>({
                action: Action.ViewUser,
                // XXX: We should be using a real member object and not assuming what the receiver wants.
                member: member || ({ userId } as User),
            });
            return success();
        },
        category: CommandCategories.advanced,
    }),
    new Command({
        command: "rageshake",
        aliases: ["bugreport"],
        description: _td("slash_command|rageshake"),
        isEnabled: () => !!SdkConfig.get().bug_report_endpoint_url,
        args: "<description>",
        runFn: function (cli, roomId, threadId, args) {
            return success(
                Modal.createDialog(BugReportDialog, {
                    initialText: args,
                }).finished,
            );
        },
        category: CommandCategories.advanced,
    }),
    new Command({
        command: "tovirtual",
        description: _td("slash_command|tovirtual"),
        category: CommandCategories.advanced,
        isEnabled(cli): boolean {
            return !!LegacyCallHandler.instance.getSupportsVirtualRooms() && !isCurrentLocalRoom(cli);
        },
        runFn: (cli, roomId) => {
            return success(
                (async (): Promise<void> => {
                    const room = await VoipUserMapper.sharedInstance().getVirtualRoomForRoom(roomId);
                    if (!room) throw new UserFriendlyError("slash_command|tovirtual_not_found");
                    dis.dispatch<ViewRoomPayload>({
                        action: Action.ViewRoom,
                        room_id: room.roomId,
                        metricsTrigger: "SlashCommand",
                        metricsViaKeyboard: true,
                    });
                })(),
            );
        },
    }),
    new Command({
        command: "query",
        description: _td("slash_command|query"),
        args: "<user-id>",
        runFn: function (cli, roomId, threadId, userId) {
            // easter-egg for now: look up phone numbers through the thirdparty API
            // (very dumb phone number detection...)
            const isPhoneNumber = userId && /^\+?[0123456789]+$/.test(userId);
            if (!userId || ((!userId.startsWith("@") || !userId.includes(":")) && !isPhoneNumber)) {
                return reject(this.getUsage());
            }

            return success(
                (async (): Promise<void> => {
                    if (isPhoneNumber) {
                        const results = await LegacyCallHandler.instance.pstnLookup(userId);
                        if (!results || results.length === 0 || !results[0].userid) {
                            throw new UserFriendlyError("slash_command|query_not_found_phone_number");
                        }
                        userId = results[0].userid;
                    }

                    const roomId = await ensureDMExists(cli, userId);
                    if (!roomId) throw new Error("Failed to ensure DM exists");

                    dis.dispatch<ViewRoomPayload>({
                        action: Action.ViewRoom,
                        room_id: roomId,
                        metricsTrigger: "SlashCommand",
                        metricsViaKeyboard: true,
                    });
                })(),
            );
        },
        category: CommandCategories.actions,
    }),
    new Command({
        command: "msg",
        description: _td("slash_command|msg"),
        args: "<user-id> [<message>]",
        runFn: function (cli, roomId, threadId, args) {
            if (args) {
                // matches the first whitespace delimited group and then the rest of the string
                const matches = args.match(/^(\S+?)(?: +(.*))?$/s);
                if (matches) {
                    const [userId, msg] = matches.slice(1);
                    if (userId && userId.startsWith("@") && userId.includes(":")) {
                        return success(
                            (async (): Promise<void> => {
                                const roomId = await ensureDMExists(cli, userId);
                                if (!roomId) throw new Error("Failed to ensure DM exists");

                                dis.dispatch<ViewRoomPayload>({
                                    action: Action.ViewRoom,
                                    room_id: roomId,
                                    metricsTrigger: "SlashCommand",
                                    metricsViaKeyboard: true,
                                });
                                if (msg) {
                                    cli.sendTextMessage(roomId, msg);
                                }
                            })(),
                        );
                    }
                }
            }

            return reject(this.getUsage());
        },
        category: CommandCategories.actions,
    }),
    new Command({
        command: "holdcall",
        description: _td("slash_command|holdcall"),
        category: CommandCategories.other,
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            const call = LegacyCallHandler.instance.getCallForRoom(roomId);
            if (!call) {
                return reject(new UserFriendlyError("slash_command|no_active_call"));
            }
            call.setRemoteOnHold(true);
            return success();
        },
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "unholdcall",
        description: _td("slash_command|unholdcall"),
        category: CommandCategories.other,
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            const call = LegacyCallHandler.instance.getCallForRoom(roomId);
            if (!call) {
                return reject(new UserFriendlyError("slash_command|no_active_call"));
            }
            call.setRemoteOnHold(false);
            return success();
        },
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "converttodm",
        description: _td("slash_command|converttodm"),
        category: CommandCategories.other,
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            const room = cli.getRoom(roomId);
            if (!room) return reject(new UserFriendlyError("slash_command|could_not_find_room"));
            return success(guessAndSetDMRoom(room, true));
        },
        renderingTypes: [TimelineRenderingType.Room],
    }),
    new Command({
        command: "converttoroom",
        description: _td("slash_command|converttoroom"),
        category: CommandCategories.other,
        isEnabled: (cli) => !isCurrentLocalRoom(cli),
        runFn: function (cli, roomId, threadId, args) {
            const room = cli.getRoom(roomId);
            if (!room) return reject(new UserFriendlyError("slash_command|could_not_find_room"));
            return success(guessAndSetDMRoom(room, false));
        },
        renderingTypes: [TimelineRenderingType.Room],
    }),

    // Command definitions for autocompletion ONLY:
    // /me is special because its not handled by SlashCommands.js and is instead done inside the Composer classes
    new Command({
        command: "me",
        args: "<message>",
        description: _td("slash_command|me"),
        category: CommandCategories.messages,
        hideCompletionAfterSpace: true,
    }),

    ...CHAT_EFFECTS.map((effect) => {
        return new Command({
            command: effect.command,
            description: effect.description(),
            args: "<message>",
            runFn: function (cli, roomId, threadId, args) {
                let content: IContent;
                if (!args) {
                    content = ContentHelpers.makeEmoteMessage(effect.fallbackMessage());
                } else {
                    content = {
                        msgtype: effect.msgType,
                        body: args,
                    };
                }
                dis.dispatch({ action: `effects.${effect.command}` });
                return successSync(content);
            },
            category: CommandCategories.effects,
            renderingTypes: [TimelineRenderingType.Room],
        });
    }),
];

// build a map from names and aliases to the Command objects.
export const CommandMap = new Map<string, Command>();
Commands.forEach((cmd) => {
    CommandMap.set(cmd.command, cmd);
    cmd.aliases.forEach((alias) => {
        CommandMap.set(alias, cmd);
    });
});

export function parseCommandString(input: string): { cmd?: string; args?: string } {
    // trim any trailing whitespace, as it can confuse the parser for IRC-style commands
    input = input.trimEnd();
    if (input[0] !== "/") return {}; // not a command

    const bits = input.match(/^(\S+?)(?:[ \n]+((.|\n)*))?$/);
    let cmd: string;
    let args: string | undefined;
    if (bits) {
        cmd = bits[1].substring(1).toLowerCase();
        args = bits[2];
    } else {
        cmd = input;
    }

    return { cmd, args };
}

interface ICmd {
    cmd?: Command;
    args?: string;
}

/**
 * Process the given text for /commands and returns a parsed command that can be used for running the operation.
 * @param {string} input The raw text input by the user.
 * @return {ICmd} The parsed command object.
 * Returns an empty object if the input didn't match a command.
 */
export function getCommand(input: string): ICmd {
    const { cmd, args } = parseCommandString(input);

    if (cmd && CommandMap.has(cmd) && CommandMap.get(cmd)!.isEnabled(MatrixClientPeg.get())) {
        return {
            cmd: CommandMap.get(cmd),
            args,
        };
    }
    return {};
}
