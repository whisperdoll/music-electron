import { Dialog } from "./dialog";
import { InputDialog } from "./inputdialog";
import { Song } from "./song";
import { createElement } from "./util";
import * as path from "path";
import { RenameRule } from "./renamerule";

export class RenameDialog extends Dialog
{
    private input : HTMLInputElement;
    private previews : HTMLElement[] = [];
    private songs : Song[];
    private previewContainer : HTMLElement;
    private acceptButton : HTMLElement;
    private onerr : (err : NodeJS.ErrnoException) => void;

    constructor(onerr : (err : NodeJS.ErrnoException) => void)
    {
        super();
        this.container.classList.add("rename");

        this.onerr = onerr;

        this.input = <HTMLInputElement>createElement("input", "rule");
        this.input.value = "%artist% - %title%";
        this.input.addEventListener("input", this.updatePreview.bind(this));

        this.acceptButton = createElement("button", "accept");
        this.acceptButton.innerText = "do it,,,";
        this.acceptButton.addEventListener("click", this.accept.bind(this));

        this.previewContainer = createElement("table", "previewContainer");

        let hint = createElement("div", "hint");
        hint.innerText = "Available tokens: " + RenameRule.tokenList.map(token => "%" + token + "%").join(", ");

        this.appendChild(this.input);
        this.appendChild(this.acceptButton);
        this.appendChild(hint);
        this.appendChild(this.previewContainer);
    }

    public show(songs? : Song[]) : void
    {
        super.show();

        if (songs)
        {
            this.songs = songs;
            this.previewContainer.innerHTML = "";
            this.previews = [];

            songs.forEach(song =>
            {
                let tr = createElement("tr");
    
                let td_og = createElement("td", "original");
                td_og.innerText = path.basename(song.filename);
                tr.appendChild(td_og);
    
                let td_preview = createElement("td", "preview");
                this.previews.push(td_preview);
                tr.appendChild(td_preview);
    
                this.previewContainer.appendChild(tr);
            });

            this.updatePreview();
        }
    }

    private updatePreview() : void
    {
        let rule = this.input.value;
        
        this.songs.forEach((song, i) =>
        {
            let newBasename = RenameRule.getBasenameFor(song, rule);

            if (path.basename(song.filename) === newBasename)
            {
                this.previews[i].classList.remove("changed");
            }
            else
            {
                this.previews[i].classList.add("changed");
            }

            this.previews[i].innerText = newBasename;
        });
    }

    private accept() : void
    {
        let rule = this.input.value;

        this.songs.forEach(song =>
        {
            song.renameFile(RenameRule.getFilenameFor(song, rule), (err) =>
            {
                this.onerr(err);
            });
        });

        this.hide();
    }
}