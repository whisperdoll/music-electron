import { Widget } from "./widget";
import { PlaylistView } from "./playlistview";
import { createElement, secsToMinSecs } from "./util";

export class StatusBar extends Widget
{
    private selectionInfo : HTMLElement;
    constructor(private playlistWidget : PlaylistView)
    {
        super("statusBar");

        this.playlistWidget.playlist.on("selectionchange", () => this.update());
        this.playlistWidget.playlist.on("update", () => this.update());

        this.selectionInfo = createElement("span");

        this.appendChild(this.selectionInfo);
    }

    private update() : void
    {
        let currentSelection = this.playlistWidget.playlist.currentSelection;
        this.selectionInfo.innerText = currentSelection.length + " item(s) selected";
        let runningTime = 0;
        currentSelection.forEach(item =>
        {
            runningTime += item.metadata.length;
        });
        this.selectionInfo.innerText += " (" + secsToMinSecs(runningTime) + ")";
    }
}