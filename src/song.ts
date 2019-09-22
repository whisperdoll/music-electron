import { fileExists, createElement, getUserDataPath, emptyFn, bigintStatSync } from "./util";
import { Widget } from "./widget";
import * as mm from "music-metadata";
import * as electron from "electron";
import * as fs from "fs";
import * as path from "path";
import { SafeWriter } from "./safewriter";
import { EventClass } from "./eventclass";
import { Playlist } from "./playlist";
import { FileCache } from "./filecache";

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

export class Song extends EventClass
{
    private static idCounter = 0;
    protected filterList : string[];
    public metadata : Metadata;
    public readonly id : string;

    private _filename : string;
    public tags : string[];

    public stats : fs.Stats;

    private _selected : boolean = false;
    private _skipping : boolean = false;
    private _playing : boolean = false;

    constructor(filename : string)
    {
        super();

        this.createEvent("load");
        this.createEvent("updatestate");
        this.createEvent("updatemetadata");

        this.id = Song.genId();

        this.tags = [];
        this.stats =  bigintStatSync(filename);
        this._filename = path.normalize(filename);
        this.metadata = FileCache.metadata[this.fid];
    }

    public get selected() : boolean
    {
        return this._selected;
    }

    public set selected(selected : boolean)
    {
        this._selected = selected;
        this.emitEvent("updatestate");
    }

    public get skipping() : boolean
    {
        return this._skipping;
    }

    public set skipping(skipping : boolean)
    {
        this._skipping = skipping;
        this.emitEvent("updatestate");
    }

    public get playing() : boolean
    {
        return this._playing;
    }

    public set playing(playing : boolean)
    {
        this._playing = playing;
        this.emitEvent("updatestate");
    }

    private static genId() : string
    {
        return (this.idCounter++).toString();
    }

    public get fid() : string
    {
        return this.stats.ino.toString();
    }

    public hasFid(fid : string) : boolean
    {
        return this.fid === fid;
    }

    public hasFilename(filename : string) : boolean
    {
        return path.normalize(filename) === this.filename;
    }

    public getFilename() : string
    {
        return this.filename;
    }

    public load() : void
    {
        let afterLoad = () =>
        {
            this.emitEvent("load");
            this.emitEvent("updatemetadata");
            this.makeFilterList();
        };

        if (!fileExists(this.filename))
        {
            throw "file not found: " + this.filename;
        }
        
        if (!this.metadata)
        {
            this.retrieveMetadata(afterLoad);
        }
        else
        {
            afterLoad();
        }
    }

    public refreshMetadata()
    {
        this.retrieveMetadata(() => this.emitEvent("updatemetadata"));
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

    public renameFile(newFilename : string, callback : (err : NodeJS.ErrnoException) => void) : void
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

    public get filename() : string
    {
        return this._filename;
    }

    protected makeFilterList() : void
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

    protected matchesFilterPart(filterPart : string) : boolean
    {
        filterPart = filterPart.replace(/\\(.)/g, "$1");
        //console.log("matches part?: " + filterPart);
        if (filterPart.indexOf(":") !== -1)
        {
            let parts = filterPart.split(":");
            switch (parts[0])
            {
                case "id":
                {
                    return this.id === parts[1];
                }
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

    private retrieveMetadata(callback? : Function) : void
    {
        mm.parseFile(this.filename).then((metadata : mm.IAudioMetadata) =>
        {
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
                        FileCache.metadata[this.fid] = this.metadata;
                        FileCache.writeCache();
                        callback && callback();
                    });
                }
            }
            else
            {
                this.metadata.picture = "";
                FileCache.metadata[this.fid] = this.metadata;
                FileCache.writeCache();
                callback && callback();
            }
        });
    }
}