import { Widget } from "./widget";
import { PlaylistWidget } from "./playlistwidget";
import { createElement, secsToMinSecs } from "./util";

export class StatusBar extends Widget
{
    private selectionInfo : HTMLElement;
    constructor(private playlistWidget : PlaylistWidget)
    {
        super("statusBar");

        this.playlistWidget.on("selectionchange", () => this.update());

        this.selectionInfo = createElement("span");

        this.appendChild(this.selectionInfo);
    }

    private update() : void
    {
        this.selectionInfo.innerText = this.playlistWidget.currentSelection.length + " item(s) selected";
        let runningTime = 0;
        this.playlistWidget.currentSelectionItems.forEach(item =>
        {
            runningTime += item.metadata.length;
        });
        this.selectionInfo.innerText += " (" + secsToMinSecs(runningTime) + ")";
    }
}