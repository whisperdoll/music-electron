import { Widget } from "./widget";
import { Song } from "./song";
import { createElement, fileExists } from "./util";

export class SongView extends Widget
{
    private thumbnail : HTMLImageElement;
    private primaryLabel : HTMLElement;
    private secondaryLabel : HTMLElement;
    private static defaultThumbnailSrc = "img/default.png";
    private _song : Song;

    constructor(song : Song)
    {
        super("song");

        this.createEvent("dblclick");
        this.createEvent("rightclick");
        this.createEvent("mousedown");

        this._song = song;
        this.song.clearEvent("updatestate");
        this.song.clearEvent("updatemetadata");
        this.song.only("updatestate", () => this.updateState());
        this.song.only("updatemetadata", () => this.updateMetadata());

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

        this.construct();
    }

    public get song() : Song
    {
        return this._song;
    }

    public set song(song : Song)
    {
        this.song && this.song.clearEvent("updatestate");
        this.song && this.song.clearEvent("updatemetadata");
        this._song = song;
        this.song.only("updatestate", () => this.updateState());
        this.song.only("updatemetadata", () => this.updateMetadata());
        this.updateMetadata();
        this.updateState();
    }

    public construct() : void
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
            //this.emitEvent("load");
        });
        this.thumbnail.addEventListener("error", (err) =>
        {
            this.thumbnail.style.opacity = "1";
            this.thumbnail.src = SongView.defaultThumbnailSrc;
            throw "uhh thum nail ? " + this.song.metadata.title;
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

        this.updateMetadata(); // takes care of loading thumbnail
        this.container.appendChild(frag);
    }

    public updateMetadata()
    {
        if (this.song.metadata.picture)
        {
            if (fileExists(this.song.metadata.picture))
            {
                this.thumbnail.src = this.song.metadata.picture;
            }
            else
            {
                //this.song.retrieveMetadata(this.update.bind(this));
                this.thumbnail.src = SongView.defaultThumbnailSrc;
            }
        }
        else
        {
            this.thumbnail.src = SongView.defaultThumbnailSrc;
        }
        
        this.primaryLabel.innerText = this.song.metadata.title;
        this.secondaryLabel.innerText = this.song.metadata.artist + " — " + this.song.metadata.album;

        if (this.song.metadata.track)
        {
            this.secondaryLabel.innerText += " [" + this.song.metadata.track.toString() + "]";
        }
    }

    public updateState()
    {
        this.container.classList.toggle("selected", this.song.selected);
        this.container.classList.toggle("skipping", this.song.skipping);
        this.container.classList.toggle("playing", this.song.playing);
    }
}