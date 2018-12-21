import { fileExists, createElement, getUserDataPath, emptyFn } from "./util";
import { Widget } from "./widget";
import * as mm from "music-metadata";
import * as electron from "electron";
import * as fs from "fs";
import * as path from "path";
import { SafeWriter } from "./safewriter";

export interface Metadata
{
    title : string,
    artist : string,
    album : string,
    length : number,
    picture : string,
    plays : number,
    track : number
}

export class Song extends Widget
{
    private _filename : string;
    public metadata : Metadata;
    private _metadata : Metadata; // to see what all is there later
    public tags : string[];
    private filterList : string[];

    private thumbnail : HTMLImageElement;
    private primaryLabel : HTMLElement;
    private secondaryLabel : HTMLElement;
    public stats : fs.Stats;

    constructor(filename : string, stats : fs.Stats, metadata? : Metadata)
    {
        super("song");

        this.createEvent("load");
        this.createEvent("click");
        this.createEvent("dblclick");
        this.createEvent("rightclick");
        this.createEvent("mousedown");

        this.tags = [];
        this.metadata = metadata;
        this.stats = stats;
        this._filename = path.normalize(filename);

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
    }

    public get fid() : string
    {
        return this.stats.ino.toString();
    }

    public load() : void
    {
        this.setFilename(this._filename);
    }

    public rename(newFilename : string, callback : (err : NodeJS.ErrnoException) => void) : void
    {
        fs.rename(this.filename, newFilename, (err) =>
        {
            if (!err)
            {
                this.renameShallow(newFilename);
            }

            callback(err);
        });
    }

    public renameShallow(newFilename : string)
    {
        this._filename = newFilename;
    }

    private construct(callback? : Function) : void
    {
        this.container.innerHTML = "";
        let frag = document.createDocumentFragment();

        //console.time("creating thumbnail for " + this._filename);
        this.thumbnail = <HTMLImageElement>document.createElement("img");
        this.thumbnail.className = "thumbnail";
        (this.thumbnail.onload as any) = callback.bind(this);
        (this.thumbnail.onerror as any) = callback.bind(this);
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

        this.updateContainer();
        this.container.appendChild(frag);
    }

    public updateContainer()
    {
        this.thumbnail.src = this.metadata.picture || "img/default.png";
        this.primaryLabel.innerText = this.metadata.title;
        this.secondaryLabel.innerText = this.metadata.artist + " — " + this.metadata.album;
    }

    public get filename() : string
    {
        return this._filename;
    }

    private setFilename(filename : string) : void
    {
        if (!fileExists(filename))
        {
            throw "file not found: " + filename;
        }

        this._filename = filename;

        if (!this.metadata)
        {
            this.retrieveMetadata(() =>
            {
                this.makeFilterList();
                this.construct(() =>
                {
                    this.emitEvent("load");
                });
            });
        }
        else
        {
            //console.time("make filter list for " + this._filename);
            this.makeFilterList();
            //console.timeEnd("make filter list for " + this._filename);

            //console.time("construct " + this._filename);
            this.construct(() =>
            {
                //console.timeEnd("construct " + this._filename);
                this.emitEvent("load");
            });
        }
    }

    private makeFilterList() : void
    {
        this.filterList = [];

        for (let x in this.metadata)
        {
            if (x === "picture") continue;

            let thing = (this.metadata as any)[x];
            if (typeof(thing) !== "string")
            {
                thing = thing.toString();
            }

            this.filterList.push(thing.toLowerCase());
        }

        this.filterList.push(...this.tags);
    }

    public getProperty(property : string) : any
    {
        switch (property)
        {
            case "plays": return this.metadata.plays;
            case "artist": return this.metadata.artist;
            case "title": return this.metadata.title;
            case "album": return this.metadata.album;
            case "modified": return this.stats.mtimeMs;
            case "track": return this.metadata.track;
            default: return null;
        }
    }

    private matchesFilterPart(filterPart : string) : boolean
    {
        filterPart = filterPart.replace(/\\(.)/g, "$1");
        //console.log("matches part?: " + filterPart);
        if (filterPart.indexOf(":") !== -1)
        {
            let parts = filterPart.split(":");
            switch (parts[0])
            {
                case "fid":
                {
                    return this.fid === parts[1];
                }
                case "artist":
                {
                    return this.metadata.artist.toLowerCase() === parts[1].toLowerCase();
                }
                case "album":
                {
                    return this.metadata.album.toLowerCase() === parts[1].toLowerCase();
                }
                case "title":
                {
                    return this.metadata.title.toLowerCase() === parts[1].toLowerCase();
                }
            }
        }

        return this.filterList.some(filterListPart =>
        {
            return filterListPart.indexOf(filterPart) !== -1;
        });
    }

    public matchesFilter(filter : string) : boolean
    {
        if (!filter)
        {
            return true;
        }

        if (filter.length > 1 && filter[0] === '(' && filter[filter.length - 1] === ')')
        {
            filter = filter.substr(1, filter.length - 2);
            return this.matchesFilter(filter);
        }

        filter = filter.replace(/&/g, " ").trim();
        while (filter.indexOf("  ") !== -1)
        {
            filter = filter.replace(/  /g, " ");
        }

        let pcounter = 0;
        let quoteSwitch = false;
        for (let i = 0; i < filter.length; i++)
        {
            if (filter[i] === "\\" && filter[i - 1] !== "\\")
            {
                i++;
                continue;
            }

            if (filter[i] === '"')
            {
                quoteSwitch = !quoteSwitch;
            }
            else if (!quoteSwitch)
            {
                if (filter[i] === "(")
                {
                    pcounter++;
                }
                else if (filter[i] === ")" && pcounter > 0)
                {
                    pcounter--;
                }
                else if (filter[i] === "|" && pcounter === 0)
                {
                    let left = filter.substr(0, i);
                    let right = filter.substr(i + 1);
                    return this.matchesFilter(left) || this.matchesFilter(right);
                }
            }
        }
        
        pcounter = 0;
        quoteSwitch = false;
        for (let i = 0; i < filter.length; i++)
        {
            if (filter[i] === "\\" && filter[i - 1] !== "\\")
            {
                i++;
                continue;
            }

            if (filter[i] === '"')
            {
                quoteSwitch = !quoteSwitch;
            }
            else if (!quoteSwitch)
            {
                if (filter[i] === "(")
                {
                    pcounter++;
                }
                else if (filter[i] === ")" && pcounter > 0)
                {
                    pcounter--;
                }
                else if ((filter[i] === " ") && pcounter === 0)
                {
                    let left = filter.substr(0, i);
                    let right = filter.substr(i + 1);
                    return this.matchesFilter(left) && this.matchesFilter(right);
                }
            }
        }

        if (filter.length > 1 && filter[0] === '"' && filter[filter.length - 1] === '"')
        {
            filter = filter.substr(1, filter.length - 2);
        }

        return this.matchesFilterPart(filter);
    }

    public retrieveMetadata(callback? : Function) : void
    {
        mm.parseFile(this.filename).then((metadata : mm.IAudioMetadata) =>
        {
            this._metadata = (metadata as any);

            let plays = 0;

            if (this.metadata && this.metadata.plays)
            {
                plays = this.metadata.plays;
            }

            this.metadata =
            {
                title: "",
                artist: "",
                album: "",
                length: 0,
                picture: "",
                plays: plays,
                track: 0
            };

            ////console.log(metadata);

            if (metadata.common.title) this.metadata.title = metadata.common.title;
            if (metadata.common.artist) this.metadata.artist = metadata.common.artist;
            if (metadata.common.track && metadata.common.track.no) this.metadata.track = metadata.common.track.no;
            if (metadata.common.album) this.metadata.album = metadata.common.album;
            if (metadata.format.duration) this.metadata.length = metadata.format.duration;

            if (metadata.common.picture && metadata.common.picture[0])
            {
                let format = metadata.common.picture[0].format;
                format = format.substr(format.indexOf("/") + 1);

                let src = path.join(getUserDataPath(), this.fid + "." + format);
                
                if (src !== this.metadata.picture)
                {
                    SafeWriter.write(src, metadata.common.picture[0].data, (err) =>
                    {
                        if (err)
                        {
                            throw err;
                        }

                        this.metadata.picture = src;
                        callback && callback();
                    });
                }
            }
            else
            {
                this.metadata.picture = "";
                callback && callback();
            }
            
        });
    }
}