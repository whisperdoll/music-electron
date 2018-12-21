import { Dialog } from "./dialog";
import { InputDialog } from "./inputdialog";
import { Playlist, PlaylistType } from "./songs";
import { createElement, createOptionElement, showElement, hideElement } from "./util";

export class PlaylistDialog extends InputDialog<Playlist>
{
    private onerr : (err : NodeJS.ErrnoException) => void;

    private nameLabel : HTMLSpanElement;
    private nameInput : HTMLInputElement;
    private typeLabel : HTMLSpanElement;
    private typeComboBox : HTMLSelectElement;
    private filterLabel : HTMLSpanElement;
    private filterInput : HTMLInputElement;
    private pathsInput : HTMLTextAreaElement;
    private pathSelect : HTMLInputElement;
    private pathSelectLabel : HTMLLabelElement;
    private okButton : HTMLElement;
    private cancelButton : HTMLElement;

    private editing : Playlist;

    constructor(onerr : (err : NodeJS.ErrnoException) => void, onreturn? : (returnValue : Playlist) => void)
    {
        super(onreturn);
        this.container.classList.add("playlist");

        this.nameLabel = <HTMLSpanElement>createElement("span", "nameLabel");
        this.nameLabel.innerText = "Name:";

        this.filterLabel = <HTMLSpanElement>createElement("span", "filterLabel");
        this.filterLabel.innerText = "Filter:";

        this.typeLabel = <HTMLSpanElement>createElement("span", "typeLabel");
        this.typeLabel.innerText = "Type:";

        this.nameInput = <HTMLInputElement>createElement("input", "name");
        this.nameInput.type = "text";

        this.typeComboBox = <HTMLSelectElement>createElement("select", "type");
        this.typeComboBox.add(createOptionElement("Smart Playlist", "pathList"));
        this.typeComboBox.add(createOptionElement("Manual Playlist", "songList"));
        this.typeComboBox.addEventListener("input", () =>
        {
            this.updateGUI();
        });

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
            this.emitEvent("return", InputDialog.NO_RESPONSE);
            this.hide();
        });

        this.appendChild(
            this.nameLabel,
            this.typeLabel,
            this.filterLabel,
            this.nameInput,
            this.typeComboBox,
            this.filterInput,
            this.pathsInput,
            this.pathSelectLabel,
            this.okButton,
            this.cancelButton
        );
    }

    private updateGUI() : void
    {
        let fn = this.typeComboBox.value === "pathList" ? showElement : hideElement;
            
        fn(this.filterInput);
        fn(this.pathsInput);
        fn(this.pathSelect);
        fn(this.pathSelectLabel);
        fn(this.filterLabel);
    }

    public get isEditing() : boolean
    {
        return !!this.editing;
    }

    public show(playlist? : Playlist) : void
    {
        this.pathSelect.type = "";
        this.pathSelect.type = "file";

        if (playlist)
        {
            this.editing = playlist;
            this.nameInput.value = playlist.name;
            this.typeComboBox.value = playlist.type;
            this.filterInput.value = playlist.filter || "";
            this.pathsInput.value = playlist.sourcePaths ? playlist.sourcePaths.join("\n") : "";
        }
        else
        {
            this.editing = null;
            this.nameInput.value = "";
            this.typeComboBox.value = "pathList";
            this.filterInput.value = "";
            this.pathsInput.value = "";
        }

        this.updateGUI();

        super.show();
    }

    private makeAndReturnObject() : void
    {
        let ret : Playlist;
        let type = <PlaylistType>this.typeComboBox.value;

        if (this.editing)
        {
            ret = this.editing;
            ret.name = this.nameInput.value;
            ret.type = type;
            
            if (type === "pathList")
            {
                ret.filter = this.filterInput.value;
                ret.sourcePaths = this.pathsInput.value.split("\n");
            }
        }
        else
        {
            ret =
            {
                filenames: [],
                filter: this.filterInput.value,
                sourcePaths: this.pathsInput.value.split("\n"),
                type: type,
                name: this.nameInput.value
            };
        }

        
        this.emitEvent("return", ret);
    }
}