import { endsWith, mergeSorted, array_copy, array_shuffle, SortFunction, array_swap, getUserDataPath, array_item_at, bigintStat, bigintStatSync, emptyFn } from "./util";
const dir = require("node-dir");
import * as fs from "fs";
import * as npath from "path";
import { SafeWriter } from "./safewriter";
import { EventClass } from "./eventclass";
import { Metadata, PlaylistItem } from "./playlistitem";
import { Song } from "./song";
import { PlaylistData, SongData, PathData } from "./playlistdata";

export class Playlist extends EventClass
{
    private static cacheFilename = npath.join(getUserDataPath(), "songs.cache");
    private static cacheFid : string;
    public static metadata : { [fid : string] : Metadata };

    private noSort = (left : PlaylistItem, right : PlaylistItem) =>
    {
        let lindex = this.items.indexOf(left);
        return lindex !== -1 && lindex < this.items.indexOf(right);
    };
    
    public items : PlaylistItem[] = [];
    public static allowedExtensions : string[] =
    [
        "mp3",
        "m4a"
    ];

    private permFilter : string = "";
    private _filter : string = "";
    private _previewFilter : string = "";
    private _filteredItems : PlaylistItem[] = [];
    private shuffledIndeces : number[] = [];
    private shuffled : boolean = false;
    private _defaultSortFn : SortFunction<PlaylistItem> = this.noSort;
    private loadingAmount : number;
    private loadedSoFar : number;
    private _playlistData : PlaylistData;

    private _sortFn : SortFunction<PlaylistItem> = this.defaultSortFn;

    private _loading : boolean = false;
    private _loaded : boolean = false;
    private _loadCheck : boolean = false;

    private _resetCallback : Function = null;

    constructor()
    {
        super();

        this.createEvent("loadstart");
        this.createEvent("load");
        this.createEvent("change");
        this.createEvent("reset");

        this.on("load", () =>
        {
            this._resetCallback && this._resetCallback();
        });

        if (!Playlist.metadata)
        {
            Playlist.loadMetadata();
        }
    }

    public get sortFn()
    {
        return this._sortFn;
    }

    public get filenames() : string[]
    {
        return this.items.map(item => item.getFilename());
    }

    public reset(callback : Function) : boolean
    {
        if (this._loading)
        {
            this._resetCallback = callback;
            return false;
        }

        this.items = [];
        this._filter = "";
        this._previewFilter = "";
        this._filteredItems = [];
        this._loaded = false;
        this._loading = false;
        this.emitEvent("reset");
        callback();

        return true;
    }

    public get playlistData() : PlaylistData
    {
        return this._playlistData;
    }

    public reload() : void
    {
        this.playlistData && this.loadPlaylist(this.playlistData);
    }

    public loadPlaylist(playlistData : PlaylistData) : void
    {
        this.reset(() =>
        {
            console.time("loading playlist " + playlistData.name);
            this._loading = true;
            this._loadCheck = true;
            this.loadingAmount = 0;
            this.loadedSoFar = 0;
            this._playlistData = playlistData;
            this.emitEvent("loadstart");

            playlistData.items.forEach(item =>
            {
                switch (item.type)
                {
                    case "song":
                        this.loadSong(item.data);
                        break;
                    case "path":
                        this.loadPath(item.data);
                        break;
                }
            });

            this._loadCheck = false;

            // check if they were all sync //
            this.loadedSoFar--;
            this.progressLoading();
        });
    }

    private progressLoading() : void
    {
        this.loadedSoFar++;
        if (this.loadedSoFar === this.loadingAmount && !this._loadCheck)
        {
            this._loading = false;
            this._loaded = true;
            this.sort(this.sortFn, false);
            this.filter(this.permFilter, false);
            this.emitEvent("load");
            console.timeEnd("loading playlist " + this.playlistData.name);
        }
    }

    // need to handle internal sorting of paths //

    private loadSong(data : SongData)
    {
        if (this.filenameAllowed(data.filename))
        {
            this.loadingAmount++;
            let s = new Song(data.filename);
            s.once("load", () =>
            {
                if (s.matchesFilter(this.permFilter))
                {
                    this.items.push(s);
                }

                this.progressLoading();
            });
            s.load();
        }
    }

    private loadPath(data : PathData)
    {
        this.permFilter = this.sortFromFilter(data.filter);

        try
        {
            console.time("loading path " + data.path);
            let filenames : string[] = dir.files(data.path, { sync: true });
            filenames.forEach(filename => this.loadSong({ filename }));
            console.timeEnd("loading path " + data.path);
        }
        catch (err)
        {
            throw err;
        }
    }

    private static loadMetadata() : void
    {
        let data;

        try
        {
            data = fs.readFileSync(this.cacheFilename, "utf8");
        }
        catch (err)
        {
            if (err.code === "ENOENT")
            {
                data = JSON.stringify({});
                fs.writeFileSync(this.cacheFilename, data, "utf8");
            }
            else
            {
                throw err;
            }
        }

        this.metadata = JSON.parse(data);
        
        bigintStat(this.cacheFilename, (err, stat) =>
        {
            if (err)
            {
                throw err;
            }

            this.cacheFid = stat.ino.toString();
        }); 
    }

    private get defaultSortFn() : SortFunction<PlaylistItem>
    {
        return this._defaultSortFn;
    }

    public get loaded() : boolean
    {
        return this._loaded;
    }

    public shuffle() : void
    {
        this.shuffledIndeces = this.items.map((item, i) => i);
        array_shuffle(this.shuffledIndeces);
        this.shuffled = true;
    }

    public unshuffle() : void
    {
        this.shuffled = false;
    }

    public sort(sortFn? : (a : PlaylistItem, b : PlaylistItem) => boolean, rerender : boolean = true)
    {
        if (sortFn)
        {
            //console.log("apple", sortFn);
            this._sortFn = sortFn;
        }

        this.items = this.getSorted(this.items, this.sortFn);
        this._filteredItems = this.getSorted(this.filteredItems, this.sortFn);
        rerender && this.emitEvent("change");
    }

    public filter(filter : string, rerender : boolean = true) : void
    {
        filter = filter.toLowerCase();
        filter = this.sortFromFilter(filter, false);
        //console.log("got back: " + filter);
        this._filter = filter;
        this._previewFilter = null;
        this._filteredItems = this.getFilterList(filter);
        rerender && this.emitEvent("change");
    }

    // returns filter without sorting info //
    private sortFromFilter(filter : string, rerender : boolean = true) : string
    {
        filter = filter.toLowerCase();
        //console.log("sorting from filter: " + filter);
        let q = false;
        let pcounter = 0;
        let didASort = 0;

        for (let i = 0; i < filter.length; i++)
        {
            if (filter[i] === '"')
            {
                q = !q;
                continue;
            }
            if (filter[i] === "(")
            {
                pcounter++;
                continue;
            }
            if (filter[i] === ")" && pcounter > 0)
            {
                pcounter--;
                continue;
            }

            if (!q)
            {
                if (filter.substr(i, 5) === "sort:")
                {
                    let ss = filter.substr(i + 5);
                    let is = ss.indexOf(" ");
                    let ic = ss.indexOf(":");
                    let ip = ss.indexOf(")");

                    //console.log(pcounter > 0, ip !== -1, (ip < is || is === -1));

                    if (pcounter > 0 && ip !== -1 && (ip < is || is === -1))
                    {
                        //console.log("tennis");
                        is = ip;
                    }

                    if ((is !== -1 && ic !== -1 && is < ic) || ic === -1 || (is === -1 && ic === -1))
                    {
                        // just critera //
                        if (is === -1)
                        {
                            is = ss.length;
                        }

                        let criteria = ss.substr(0, is);
                        didASort |= +this.sortByCriteria(criteria, undefined, rerender);

                        let left = filter.substr(0, i);
                        let right = filter.substr(i + 5 + is);
                        filter = left + right;
                        i = -1;
                    }
                    else if ((is !== -1 && ic !== -1 && ic < is) || is === -1)
                    {
                        // criteria and order //
                        if (is === -1)
                        {
                            is = ss.length;
                        }

                        let criteria = ss.substr(0, ic);
                        let order = ss.substr(ic + 1);
                        if (order.indexOf(" ") !== -1)
                        {
                            order = order.substr(0, order.indexOf(" "));
                        }

                        didASort |= +this.sortByCriteria(criteria, order, rerender);

                        let left = filter.substr(0, i);
                        let right = filter.substr(i + 5 + is);
                        filter = left + right;
                        i = -1;
                    }
                }
            }
        }

        if (!didASort && this.sortFn !== this.defaultSortFn)
        {
            //this.sort(this.defaultSortFn, rerender);
        }

        return filter;
    }

    private sortByCriteria(criteria : string, order? : string, rerender : boolean = true) : boolean
    {
        let sortFn = this.getSortFunctionByCriteria(criteria, order);

        if (sortFn)
        {
            this.sort(sortFn, rerender);
            return true;
        }

        return false;
    }

    private getSortFunctionByCriteria(criteria : string, order : string = "asc") : SortFunction<Song>
    {
        let criteriaArray = criteria.split(",");
        return (a : PlaylistItem, b : PlaylistItem) =>
        {    
            for (let i = 0; i < criteriaArray.length; i++)
            {
                let criterium = criteriaArray[i];
                let pa = a.getProperty(criterium);
                let pb = b.getProperty(criterium);

                if (pa === pb)
                {
                    continue;
                }
                else
                {
                    return !!(+(pa >= pb) ^ +(order[0] === "a"));
                }
            }

            return false;
        };
    }

    public previewFilter(filter : string, applyOnlyToCurrentFilter : boolean = false, rerender : boolean = true) : void
    {
        filter = filter.toLowerCase();
        this._previewFilter = filter;
        rerender && this.emitEvent("change");
    }

    public get filteredItems() : PlaylistItem[]
    {
        return this._filteredItems;
    }

    public findSongByFid(fid : string) : PlaylistItem
    {
        return this.items.find(item => item.hasFid(fid)) || null;
    }

    public findSongByFilename(filename : string) : PlaylistItem
    {
        return this.items.filter(item => item.hasFilename(filename))[0] || null;
    }

    public itemAfter(item : PlaylistItem) : PlaylistItem
    {
        let index = this.filteredItems.indexOf(item);

        if (this.filteredItems.length === 0)
        {
            return null;
        }
        else if (index === -1)
        {
            index = 0;
        }

        if (this.shuffled)
        {
            let _index = this.shuffledIndeces.indexOf(index);
            return this.filteredItems[array_item_at(this.shuffledIndeces, _index + 1)];
        }
        else
        {
            return array_item_at(this.filteredItems, index + 1);
        }
    }

    public itemBefore(item : PlaylistItem) : PlaylistItem
    {
        let index = this.filteredItems.indexOf(item);

        if (this.filteredItems.length === 0)
        {
            return null;
        }
        else if (index === -1)
        {
            return this.filteredItems[0];
        }

        if (this.shuffled)
        {
            let _index = this.shuffledIndeces.indexOf(index);

            if (_index === 0)
            {
                return this.filteredItems[this.shuffledIndeces[this.shuffledIndeces.length - 1]];
            }
            else
            {
                return this.filteredItems[this.shuffledIndeces[_index - 1]];
            }
        }
        else
        {
            if (index === 0)
            {
                return this.filteredItems[this.filteredItems.length - 1];
            }
            else
            {
                return this.filteredItems[index - 1];
            }
        }
    }

    public moveItem(item : PlaylistItem, amount : number) : boolean
    {
        if (amount === 0) return true;

        while (amount > 0)
        {
            let index = this.filteredItems.indexOf(item);
            let next = this.filteredItems[index + 1];

            if (!next)
            {
                return false;
            }
            else
            {
                array_swap(this.filteredItems, index, index + 1);
                array_swap(this.items, item, next);
            }

            amount--;
        }

        while (amount < 0)
        {
            let index = this.filteredItems.indexOf(item);
            let prev = this.filteredItems[index - 1];

            if (!prev)
            {
                return false;
            }
            else
            {
                array_swap(this.filteredItems, index, index - 1);
                array_swap(this.items, item, prev);
            }

            amount++;
        }

        this.emitEvent("change");
        return true;
    }

    public getRenderList() : PlaylistItem[]
    {
        if (this._previewFilter)
        {
            return this.getFilterList(this._previewFilter);
        }
        else
        {
            return array_copy(this.filteredItems);
        }
    }

    private getFilterList(filter : string, fromArray? : PlaylistItem[]) : PlaylistItem[]
    {
        if (!fromArray)
        {
            fromArray = this.items;
        }

        filter = filter.toLowerCase().replace(/\(\)/g, "");

        if (filter === "")
        {
            return array_copy(fromArray);
        }

        return fromArray.filter(song => song.matchesFilter(filter));
    }

    public static writeCache(cb? : (err : Error) => void) : void
    {
        SafeWriter.write(this.cacheFilename, JSON.stringify(this.metadata), cb, this.cacheFid);
    }

    private getSorted(items : PlaylistItem[], sortFn? : SortFunction<PlaylistItem>) : PlaylistItem[]
    {
        //console.log("aaaa", sortFn || this.sortFn);
        return mergeSorted(items, sortFn || this.sortFn);
    }

    private filenameAllowed(filename : string) : boolean
    {
        let ret = Playlist.allowedExtensions.some(ext => endsWith(filename.toLowerCase(), "." + ext));

        if (!ret)
        {
            //console.log(filename + " not allowed!!!");
        }

        return ret;
    }
}