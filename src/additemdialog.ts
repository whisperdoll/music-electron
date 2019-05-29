import { InputDialog } from "./inputdialog";
import { Dialog } from "./dialog";
import { PlaylistWidget } from "./playlistwidget";
import { createElement, createOptionElement, showElement, hideElement } from "./util";
import { Playlist } from "./playlist";
import { PlaylistDataItem, SongData, PathData, PlaylistSavePath } from "./playlistdata";
import { SafeWriter } from "./safewriter";
import * as path from "path";
const { dialog } = require('electron').remote

export class AddItemDialog extends Dialog
{
    private playlistWidget : PlaylistWidget;

    private combobox : HTMLSelectElement;

    private song_filename : HTMLInputElement;

    private path_path : HTMLInputElement;
    private path_filter : HTMLInputElement;
    private path_pickOne : HTMLInputElement;

    constructor(playlistWidget : PlaylistWidget)
    {
        super(true);

        this.container.classList.add("addItemDialog");

        this.playlistWidget = playlistWidget;

        this.construct();
    }

    private addTheItem() : void
    {
        let item : PlaylistDataItem = { type: "song", data: {} };

        switch (this.combobox.value)
        {
            case "Song":
                item.type = "song";
                item.data = <SongData>{
                    filename: this.song_filename.value
                };
                break;
            case "Path":
                item.type = "path";
                item.data = <PathData>{
                    path: this.path_path.value,
                    filter: this.path_filter.value,
                    pickOne: this.path_pickOne.checked
                };
                break;
        }

        this.playlistWidget.playlistData.items.push(item);

        SafeWriter.write(path.join(PlaylistSavePath, this.playlistWidget.playlistData.name + ".playlist"), JSON.stringify(this.playlistWidget.playlistData));

        this.playlistWidget.reload();
        this.hide();
    }

    private makeRow(label : string, element : HTMLElement) : HTMLElement
    {
        let row = createElement("div", "row");

        let l = createElement("span", "label");
        l.innerText = label + ":";
        row.appendChild(l);

        row.appendChild(element);

        return row;
    }

    private attachFileDialog(input : HTMLInputElement, isPath : boolean)
    {
        input.addEventListener("click", () =>
        {
            dialog.showOpenDialog(
                {
                    title: "Select " + (isPath ? "Path" : "Song") + "!!!",
                    filters: isPath ? undefined :
                    [
                        {
                            name: "Music files, yum!!",
                            extensions: Playlist.allowedExtensions
                        }
                    ],
                    properties:
                    [
                        (isPath ? "openDirectory" : "openFile")
                    ]
                },
                (filePaths : string[]) =>
                {
                    input.value = filePaths[0];
                }
            );
        })
    }
    
    private construct() : void
    {
        this.combobox = <HTMLSelectElement>createElement("select", "combobox");
        this.combobox.appendChild(createOptionElement("Song", "Song"));
        this.combobox.appendChild(createOptionElement("Path", "Path"));
        this.combobox.addEventListener("input", this.comboboxChanged.bind(this));

        this.song_filename = <HTMLInputElement>createElement("input");
        this.song_filename.type = "text";
        this.attachFileDialog(this.song_filename, false);

        this.path_path = <HTMLInputElement>createElement("input");
        this.path_path.type = "text";
        this.attachFileDialog(this.path_path, true);
        this.path_filter = <HTMLInputElement>createElement("input");
        this.path_filter.type = "text";
        this.path_pickOne = <HTMLInputElement>createElement("input");
        this.path_pickOne.type = "checkbox";

        let okButton = createElement("button", "add");
        okButton.addEventListener("click", this.addTheItem.bind(this));
        okButton.innerText = "Add";

        let cancelButton = createElement("button", "cancel");
        cancelButton.addEventListener("click", this.hide.bind(this));
        cancelButton.innerText = "Cancel";

        let buttonRow = createElement("div", "buttonRow");
        buttonRow.appendChild(okButton);
        buttonRow.appendChild(cancelButton);

        this.appendChild(
            this.makeRow("Type", this.combobox),
            this.makeRow("Filename", this.song_filename),
            this.makeRow("Path", this.path_path),
            this.makeRow("Filter", this.path_filter),
            this.makeRow("Pick One", this.path_pickOne),
            buttonRow
        );
    }

    private hideElements() : void
    {
        hideElement(this.song_filename.parentElement);
        hideElement(this.path_path.parentElement);
        hideElement(this.path_pickOne.parentElement);
    }

    private comboboxChanged() : void
    {
        this.hideElements();

        switch (this.combobox.value)
        {
            case "Song":
                showElement(this.song_filename.parentElement);
                break;
            case "Path":
                showElement(this.path_path.parentElement);
                showElement(this.path_pickOne.parentElement);
                break;
        }
    }

    public show() : void
    {
        super.show();

        this.combobox.selectedIndex = 0;
        this.song_filename.value = "";
        this.path_path.value = "";
        this.path_pickOne.checked = false;

        this.comboboxChanged();
    }
}