import { Dialog } from "./dialog";
import { InputDialog } from "./inputdialog";
import { createElement, createOptionElement, showElement, hideElement } from "./util";
import { PlaylistData } from "./playlistdata";
import * as path from "path";

export class PlaylistDialog extends Dialog
{
    private onerr : (err : NodeJS.ErrnoException) => void;

    private nameLabel : HTMLSpanElement;
    private nameInput : HTMLInputElement;
    private filterLabel : HTMLSpanElement;
    private filterInput : HTMLInputElement;
    private pathsInput : HTMLTextAreaElement;
    private pathSelect : HTMLInputElement;
    private pathSelectLabel : HTMLLabelElement;
    private okButton : HTMLElement;
    private cancelButton : HTMLElement;

    private editing : PlaylistData;

    constructor()
    {
        super(true);

        this.createEvent("return");
        
        this.container.classList.add("playlist");

        this.nameLabel = <HTMLSpanElement>createElement("span", "nameLabel");
        this.nameLabel.innerText = "Name:";

        this.filterLabel = <HTMLSpanElement>createElement("span", "filterLabel");
        this.filterLabel.innerText = "Filter:";

        this.nameInput = <HTMLInputElement>createElement("input", "name");
        this.nameInput.type = "text";

        this.filterInput = <HTMLInputElement>createElement("input", "filter");
        this.filterInput.type = "text";

        this.pathsInput = <HTMLTextAreaElement>createElement("textarea", "paths");

        this.pathSelect = <HTMLInputElement>createElement("input", "pathSelect");
        this.pathSelect.type = "file";
        this.pathSelect.setAttribute("webkitdirectory", "true");
        this.pathSelect.addEventListener("change", () =>
        {
            let files = Array.from(this.pathSelect.files).map(file => file.path);
            this.pathsInput.value += files.join("\n");
        });

        this.pathSelectLabel = <HTMLLabelElement>createElement("label", "pathSelectLabel");
        this.pathSelectLabel.innerText = "Add Folder(s)...";
        this.pathSelectLabel.appendChild(this.pathSelect);

        this.okButton = createElement("button", "ok");
        this.okButton.innerText = "Create";
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
            this.nameInput,
            this.filterInput,
            this.pathsInput,
            this.pathSelectLabel,
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

        this.pathSelect.type = "";
        this.pathSelect.type = "file";

        this.editing = playlistData;
        this.nameInput.value = playlistData.name;
        this.filterInput.value = playlistData.filter || "";
        this.pathsInput.value = playlistData.paths ? playlistData.paths.join("\n") : "";

        super.show();
    }

    private makeAndReturnObject() : void
    {
        let ret : PlaylistData;

        ret = this.editing;
        ret.name = this.nameInput.value;
        ret.filter = this.filterInput.value;
        ret.paths = this.pathsInput.value.trim() ? this.pathsInput.value.split("\n").map(p => path.normalize(p)) : [];
        
        this.emitEvent("return", ret);
    }
}