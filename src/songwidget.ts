import { Widget } from "./widget";
import { Song } from "./song";
import { createElement, fileExists } from "./util";

export class SongWidget extends Widget
{
    public readonly song : Song;

    private thumbnail : HTMLImageElement;
    private primaryLabel : HTMLElement;
    private secondaryLabel : HTMLElement;
    private static defaultThumbnailSrc = "img/default.png";

    constructor(song : Song)
    {
        super("song");
        this.song = song;

        this.createEvent("load");
        this.createEvent("click");
        this.createEvent("dblclick");
        this.createEvent("rightclick");
        this.createEvent("mousedown");

        this.container.addEventListener("click", (e) =>
        {
            this.emitEvent("click", this, e);
        });

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

        if (song.loaded)
        {
            this.construct();
        }
        else
        {
            song.on("load", () =>
            {
                this.construct();
            });
        }
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
            this.thumbnail.src = SongWidget.defaultThumbnailSrc;
            throw "uhh thum nail ? " + this.song.filename;
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
        if (this.song.metadata.picture)
        {
            if (fileExists(this.song.metadata.picture))
            {
                this.thumbnail.src = this.song.metadata.picture;
            }
            else
            {
                this.song.retrieveMetadata(this.updateContainer.bind(this));
            }
        }
        else
        {
            this.thumbnail.src = SongWidget.defaultThumbnailSrc;
        }
        
        this.primaryLabel.innerText = this.song.metadata.title;
        this.secondaryLabel.innerText = this.song.metadata.artist + " — " + this.song.metadata.album;
    }
}