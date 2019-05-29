import { Widget } from "./widget";
import { Song } from "./song";
import { createElement, fileExists } from "./util";
import { PlaylistItem } from "./playlistitem";

export class PlaylistItemWidget extends Widget
{
    private _item : PlaylistItem;

    private thumbnail : HTMLImageElement;
    private primaryLabel : HTMLElement;
    private secondaryLabel : HTMLElement;
    private static defaultThumbnailSrc = "img/default.png";

    constructor(playlistItem : PlaylistItem)
    {
        super("song");
        this._item = playlistItem;

        this.createEvent("load");
        this.createEvent("dblclick");
        this.createEvent("rightclick");
        this.createEvent("mousedown");

        this.container.addEventListener("dblclick", (e) =>
        {
            this.emitEvent("dblclick", this, e);
        });

        this.container.addEventListener("contextmenu", e =>
        {
            this.emitEvent("rightclick", this, e);
        });

        this.container.addEventListener("mousedown", e =>
        {
            this.emitEvent("mousedown", this, e);
        });

        if (playlistItem.loaded)
        {
            this.construct();
        }
        else
        {
            playlistItem.on("load", () =>
            {
                this.construct();
            });
        }
    }

    public get item() : PlaylistItem
    {
        return this._item;
    }

    public setNewItem(item : PlaylistItem)
    {
        this._item = item;
        this.updateContainer();
    }

    private construct() : void
    {
        this.container.innerHTML = "";
        let frag = document.createDocumentFragment();

        //console.time("creating thumbnail for " + this._filename);
        this.thumbnail = <HTMLImageElement>document.createElement("img");
        this.thumbnail.className = "thumbnail";
        this.thumbnail.style.opacity = "0";
        this.thumbnail.addEventListener("load", () =>
        {
            this.thumbnail.style.opacity = "1";
            this.emitEvent("load");
        });
        this.thumbnail.addEventListener("error", (err) =>
        {
            this.thumbnail.style.opacity = "1";
            this.thumbnail.src = PlaylistItemWidget.defaultThumbnailSrc;
            throw "uhh thum nail ? " + this.item.metadata.title;
        });
        // thumbnail loaded below //
        frag.appendChild(this.thumbnail);
        //console.timeEnd("creating thumbnail for " + this._filename);

        let shadow = createElement("div", "shadow");
        frag.appendChild(shadow);
        
        let labels = createElement("div", "labels");
        
        //console.time("creating primary label for " + this._filename);
        this.primaryLabel = document.createElement("div");
        this.primaryLabel.className = "primaryLabel";
        labels.appendChild(this.primaryLabel);
        //console.timeEnd("creating primary label for " + this._filename);

        //console.time("creating secondary label for " + this._filename);
        this.secondaryLabel = document.createElement("div");
        this.secondaryLabel.className = "secondaryLabel";
        labels.appendChild(this.secondaryLabel);

        frag.appendChild(labels);
        //console.timeEnd("creating secondary label for " + this._filename);

        this.updateContainer(); // takes care of loading thumbnail
        this.container.appendChild(frag);
    }

    public updateContainer()
    {
        if (this.item.metadata.picture)
        {
            if (fileExists(this.item.metadata.picture))
            {
                this.thumbnail.src = this.item.metadata.picture;
            }
            else
            {
                //this.item.retrieveMetadata(this.updateContainer.bind(this));
                this.thumbnail.src = PlaylistItemWidget.defaultThumbnailSrc;
            }
        }
        else
        {
            this.thumbnail.src = PlaylistItemWidget.defaultThumbnailSrc;
        }
        
        this.primaryLabel.innerText = this.item.metadata.title;
        this.secondaryLabel.innerText = this.item.metadata.artist + " — " + this.item.metadata.album;
    }
}