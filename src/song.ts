import { fileExists, createElement, getUserDataPath, emptyFn } from "./util";
import { Widget } from "./widget";
import * as mm from "music-metadata";
import * as electron from "electron";
import * as fs from "fs";
import * as path from "path";
import { SafeWriter } from "./safewriter";
import { EventClass } from "./eventclass";
import { Metadata, PlaylistItem } from "./playlistitem";

export class Song extends PlaylistItem
{
    private _filename : string;
    public tags : string[];

    public stats : fs.Stats;

    constructor(filename : string, stats : fs.Stats, metadata? : Metadata)
    {
        super();

        this.metadata = metadata;
        this.tags = [];
        this.stats = stats;
        this._filename = path.normalize(filename);
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
        if (!fileExists(this.filename))
        {
            throw "file not found: " + this.filename;
        }

        super.load();
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
        this.emitEvent("change");
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

    public retrieveMetadata(callback? : Function) : void
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