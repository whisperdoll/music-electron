import { Dialog } from "./dialog";
import { InputDialog } from "./inputdialog";
import { createElement, createOptionElement, showElement, hideElement } from "./util";
import { PlaylistData } from "./playlistdata";
import * as path from "path";
import { Widget } from "./widget";
import { PlaylistDialogItems } from "./playlistdialogitems";

export class PlaylistDialog extends Dialog
{
    private onerr : (err : NodeJS.ErrnoException) => void;

    private nameLabel : HTMLSpanElement;
    private nameInput : HTMLInputElement;

    private sortLabel : HTMLSpanElement;
    private sortInput : HTMLInputElement;

    private filterLabel : HTMLSpanElement;
    private filterInput : HTMLInputElement;

    private items : PlaylistDialogItems;
    
    private okButton : HTMLElement;
    private cancelButton : HTMLElement;

    private editing : PlaylistData;

    constructor()
    {
        super(true);

        this.createEvent("return");
        this.createEvent("pathchoose");
        
        this.container.classList.add("playlist");

        this.nameLabel = <HTMLSpanElement>createElement("span", "nameLabel");
        this.nameLabel.innerText = "Name:";

        this.sortLabel = <HTMLSpanElement>createElement("span", "sortLabel");
        this.sortLabel.innerText = "Sort:";

        this.filterLabel = <HTMLSpanElement>createElement("span", "filterLabel");
        this.filterLabel.innerText = "Filter:";

        this.nameInput = <HTMLInputElement>createElement("input", "name");
        this.nameInput.type = "text";

        this.sortInput = <HTMLInputElement>createElement("input", "sort");
        this.sortInput.type = "text";

        this.filterInput = <HTMLInputElement>createElement("input", "filter");
        this.filterInput.type = "text";
        
        this.items = new PlaylistDialogItems();

        this.okButton = createElement("button", "ok");
        this.okButton.innerText = "Save";
        this.okButton.addEventListener("click", () =>
        {
            this.makeAndReturnObject();
            this.hide();
        });

        this.cancelButton = createElement("button", "cancel");
        this.cancelButton.innerText = "Cancel";
        this.cancelButton.addEventListener("click", () =>
        {
            //this.emitEvent("return", InputDialog.NO_RESPONSE);
            this.hide();
        });

        this.appendChild(
            this.nameLabel,
            this.filterLabel,
            this.sortLabel,
            this.nameInput,
            this.filterInput,
            this.sortInput,
            this.items,
            this.okButton,
            this.cancelButton
        );
    }

    public get isEditing() : boolean
    {
        return !!this.editing;
    }

    public show(playlistData? : PlaylistData) : void
    {
        if (!playlistData)
        {
            throw "ok u actually need a playlistdata";
        }

        this.editing = playlistData;
        this.nameInput.value = playlistData.name;
        this.sortInput.value = playlistData.sort;
        this.filterInput.value = playlistData.filter || "";
        this.items.paths = playlistData.paths;

        super.show();
    }

    private makeAndReturnObject() : void
    {
        let ret : PlaylistData;

        ret = this.editing;
        ret.name = this.nameInput.value;
        ret.sort = this.sortInput.value;
        ret.filter = this.filterInput.value;
        ret.paths = this.items.paths;
        
        this.emitEvent("return", ret);
    }
}
