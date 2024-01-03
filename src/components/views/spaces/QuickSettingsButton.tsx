/*
Copyright 2021 - 2023 The Matrix.org Foundation C.I.C.

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

import React from "react";
import classNames from "classnames";

import { _t } from "../../../languageHandler";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import ContextMenu, { alwaysAboveRightOf, ChevronFace, useContextMenu } from "../../structures/ContextMenu";
import AccessibleButton from "../elements/AccessibleButton";
import StyledCheckbox from "../elements/StyledCheckbox";
import { MetaSpace } from "../../../stores/spaces";
import { useSettingValue } from "../../../hooks/useSettings";
import { onMetaSpaceChangeFactory } from "../settings/tabs/user/SidebarUserSettingsTab";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { UserTab } from "../dialogs/UserTab";
import QuickThemeSwitcher from "./QuickThemeSwitcher";
import { Icon as PinUprightIcon } from "../../../../res/img/element-icons/room/pin-upright.svg";
import { Icon as EllipsisIcon } from "../../../../res/img/element-icons/room/ellipsis.svg";
import { Icon as MembersIcon } from "../../../../res/img/element-icons/room/members.svg";
import { Icon as FavoriteIcon } from "../../../../res/img/element-icons/roomlist/favorite.svg";
import Modal from "../../../Modal";
import DevtoolsDialog from "../dialogs/DevtoolsDialog";
import { SdkContextClass } from "../../../contexts/SDKContext";
import UIStore from "../../../stores/UIStore";

const QuickSettingsButton: React.FC<{
    isPanelCollapsed: boolean;
}> = ({ isPanelCollapsed = false }) => {
    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();

    const { [MetaSpace.Favourites]: favouritesEnabled, [MetaSpace.People]: peopleEnabled } =
        useSettingValue<Record<MetaSpace, boolean>>("Spaces.enabledMetaSpaces");

    const currentRoomId = SdkContextClass.instance.roomViewStore.getRoomId();
    const developerModeEnabled = useSettingValue("developerMode");

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed && handle.current) {

        contextMenu =  UIStore.instance.windowWidth < 950 ?
       (
            <ContextMenu
                {...alwaysAboveRightOf(handle.current.getBoundingClientRect(), ChevronFace.None, 16)}
                wrapperClassName="mx_QuickSettingsButton_ContextMenuWrapper"
                onFinished={closeMenu}
                managed={false}
                focusLock={true}
            >
                <QuickThemeSwitcher requestClose={closeMenu} />
            </ContextMenu>
        ) : 
            (
                <ContextMenu
                    {...alwaysAboveRightOf(handle.current.getBoundingClientRect(), ChevronFace.None, 16)}
                    wrapperClassName="mx_QuickSettingsButton_ContextMenuWrapper"
                    onFinished={closeMenu}
                    managed={false}
                    focusLock={true}
                >
                    {/* <h2>{_t("quick_settings|title")}</h2> */}
    
                    <AccessibleButton
                        onClick={() => {
                            closeMenu();
                            defaultDispatcher.dispatch({ action: Action.ViewUserSettings });
                        }}
                        kind="primary_outline"
                    >
                        {_t("quick_settings|all_settings")}
                    </AccessibleButton>
    
                    {currentRoomId && developerModeEnabled && (
                        <AccessibleButton
                            onClick={() => {
                                closeMenu();
                                Modal.createDialog(
                                    DevtoolsDialog,
                                    {
                                        roomId: currentRoomId,
                                    },
                                    "mx_DevtoolsDialog_wrapper",
                                );
                            }}
                            kind="danger_outline"
                        >
                            {_t("devtools|title")}
                        </AccessibleButton>
                    )}
    
                    <QuickThemeSwitcher requestClose={closeMenu} />
                </ContextMenu>
        );
    }

    return (
        <>
            <AccessibleTooltipButton
                className={classNames("mx_QuickSettingsButton", { expanded: !isPanelCollapsed })}
                onClick={() =>  defaultDispatcher.dispatch({ action: Action.ViewUserSettings })}
                title={_t("quick_settings|title")}
                inputRef={handle}
                forceHide={!isPanelCollapsed}
                aria-expanded={!isPanelCollapsed}
            >
                {!isPanelCollapsed ? _t("common|settings") : null}
            </AccessibleTooltipButton>

            {contextMenu}
        </>
    );
};

export default QuickSettingsButton;
