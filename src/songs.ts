import { Song, Metadata } from "./song";
import { fileExists, endsWith, getCacheFilename, readCacheFile, getFileId, writeCacheFile, mergeSorted, emptyFn, array_remove, array_insert, array_copy, array_shuffle, array_contains, SortFunction, array_insert_random, sign, array_last, array_swap, getUserDataPath, array_item_at, bigintStat, isFileNotFoundError, isWin32, revealInExplorer } from "./util";
import { Widget } from "./widget";
const dir = require("node-dir");
import * as fs from "fs";
import * as npath from "path";
import * as chokidar from "chokidar";
import { SafeWriter } from "./safewriter";
import { EventClass } from "./eventclass";

export class Songs extends EventClass
{
    private static cacheFilename = npath.join(getUserDataPath(), "songs.cache");
    private static cacheFid : string;
    private static metadata : { [fid:string] : Metadata };

    private noSort = (left : Song, right : Song) =>
    {
        let lindex = this.songs.indexOf(left);
        return lindex !== -1 && lindex < this.songs.indexOf(right);
    };
    
    public songs : Song[] = [];
    public allowedExtensions : string[] =
    [
        ".mp3",
        ".m4a"
    ];

    private permFilter : string = "";
    private _filter : string = "";
    private _previewFilter : string = "";
    private _filteredSongs : Song[] = [];
    private shuffledIndeces : number[] = [];
    private shuffled : boolean = false;
    private _defaultSortFn : SortFunction<Song> = this.noSort;

    private _sortFn : SortFunction<Song> = this.defaultSortFn;

    private watcher : chokidar.FSWatcher;

    private _loading : boolean = false;
    private _loaded : boolean = false;

    constructor()
    {
        super();

        this.createEvent("load");
        this.createEvent("loadstart");
        this.createEvent("playlistupdate");
        this.createEvent("change");
        this.createEvent("add");
        this.createEvent("remove");

        if (!Songs.metadata)
        {
            Songs.loadMetadata();
        }
    }

    public get sortFn()
    {
        return this._sortFn;
    }

    public get type()
    {
        return this._type;
    }

    public isPlaylist(playlist : Playlist) : boolean
    {
        return this._loadedFrom === playlist;
    }

    public reset() : boolean
    {
        if (this._loading)
        {
            this.once("load", () =>
            {
                this.reset();
            });

            return false;
        }

        this.songs = [];
        this.sourcePaths = [];
        this.sortString = null;
        this._filter = "";
        this._previewFilter = "";
        this._filteredSongs = [];
        this._loaded = false;
        this._loading = false;
        this.watcher = null;
        this._type = null;
        this.filename = null;
        this._loadedFrom = null;
        this.emitEvent("change");

        return true;
    }

    public get loadedFrom() : Playlist
    {
        return this._loadedFrom;
    }

    public loadFromPlaylist(o : Playlist) : void
    {
        this.reset();
        this._loading = true;
        this._type = o.type;
        this.filename = o.filename;
        this.name = o.name;
        this._loadedFrom = o;
        this.emitEvent("loadstart");
        
        if (o.type === "pathList")
        {
            this.permFilter = this.sortFromFilter(o.filter, false);
            this.sourcePaths = o.sourcePaths;
            this.loadFromPaths(o.sourcePaths, () =>
            {
                if (!this.sortFn) // should be set from sortFromFilter above
                {
                    this._sortFn = this.noSort;
                }
                this._defaultSortFn = this.sortFn;
                this.filter(o.filter);
                this._loaded = true;
                this._loading = false;
                this.emitEvent("load");
            });
        }
        else if (o.type === "songList")
        { 
            o.filenames = o.filenames.map(filename =>
            {
                return npath.normalize(filename);
            });

            this.permFilter = "";
            this.loadFromFilenames(o.filenames, () =>
            {
                this.sort((left, right) =>
                {
                    return o.filenames.indexOf(left.filename) < o.filenames.indexOf(right.filename);
                }, true);
                this._loaded = true;
                this._loading = false;
                this.emitEvent("load");
            });
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

    private get defaultSortFn() : SortFunction<Song>
    {
        return this._defaultSortFn;
    }

    public get loaded() : boolean
    {
        return this._loaded;
    }

    public toPlaylist() : Playlist
    {
        return {
            type: this.type,
            filenames: this.type === "songList" ? this.filenames : null,
            filter: this.type === "songList" ? null : this.permFilter,
            sourcePaths: this.type === "songList" ? null : this.sourcePaths,
            name: this.name,
            filename: this.filename
        };
    }

    public get filenames() : string[]
    {
        return this.songs.map(song => song.filename);
    }

    public shuffle() : void
    {
        this.shuffledIndeces = [];
        for (let i = 0; i < this.songs.length; i++)
        {
            this.shuffledIndeces.push(i);
        }

        array_shuffle(this.shuffledIndeces);
        this.shuffled = true;
    }

    public unshuffle() : void
    {
        this.shuffled = false;
    }

    public sort(sortFn? : (a : Song, b : Song) => boolean, rerender : boolean = true)
    {
        if (sortFn)
        {
            //console.log("apple", sortFn);
            this._sortFn = sortFn;
        }

        this.songs = this.getSorted(this.songs, this.sortFn);
        this._filteredSongs = this.getSorted(this.filteredSongs, this.sortFn);
        rerender && this.emitEvent("change");
    }

    public filter(filter : string, rerender : boolean = true) : void
    {
        filter = filter.toLowerCase();
        filter = this.sortFromFilter(filter, false);
        //console.log("got back: " + filter);
        this._filter = filter;
        this._previewFilter = null;
        this._filteredSongs = this.getFilterList(filter);
        rerender && this.emitEvent("change");
    }

    // returns filter without sorting info //
    private sortFromFilter(filter : string, rerender : boolean = true) : string
    {
        filter = filter.toLowerCase();
        console.log("sorting from filter: " + filter);
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
            this.sort(this.defaultSortFn, rerender);
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
        return (a : Song, b : Song) =>
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

    public get filteredSongs() : Song[]
    {
        return this._filteredSongs;
    }

    public findSongByFid(fid : string) : Song
    {
        return this.songs.find(song => song.fid === fid) || null;
    }

    public findSongByFilename(filename : string) : Song
    {
        filename = npath.normalize(filename);
        return this.songs.filter(song => npath.normalize(song.filename) === filename)[0] || null;
    }

    public songAfter(song : Song) : Song
    {
        let index = this.filteredSongs.indexOf(song);

        if (this.filteredSongs.length === 0)
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
            return this.filteredSongs[array_item_at(this.shuffledIndeces, _index + 1)];
        }
        else
        {
            return array_item_at(this.filteredSongs, index + 1);
        }
    }

    public songBefore(song : Song) : Song
    {
        let index = this.filteredSongs.indexOf(song);

        if (this.filteredSongs.length === 0)
        {
            return null;
        }
        else if (index === -1)
        {
            return this.filteredSongs[0];
        }

        if (this.shuffled)
        {
            let _index = this.shuffledIndeces.indexOf(index);

            if (_index === 0)
            {
                return this.filteredSongs[this.shuffledIndeces[this.shuffledIndeces.length - 1]];
            }
            else
            {
                return this.filteredSongs[this.shuffledIndeces[_index - 1]];
            }
        }
        else
        {
            if (index === 0)
            {
                return this.filteredSongs[this.filteredSongs.length - 1];
            }
            else
            {
                return this.filteredSongs[index - 1];
            }
        }
    }

    private loadFromFilenamesHelper(filenames : string[], callback? : () => void)
    {
        let songCounter = 0;
        let numSongs = 0;
        let songsToAdd : Song[] = [];

        let check = (song : Song) =>
        {
            if (!this.permFilter || song.matchesFilter(this.permFilter))
            {
                this.songs.push(song);
                this.filteredSongs.push(song);
                songsToAdd.push(song);
            }

            songCounter++;
            //document.getElementById("a").innerText = songCounter + " / " + numSongs + "(" + (~~(songCounter / numSongs * 100)) + "%)";

            if (songCounter === numSongs)
            {
                Songs.writeCache((err) =>
                {
                    if (err)
                    {
                        throw err;
                    }
                });

                callback && callback();
            }
        };

        filenames = filenames.filter(filename =>
        {
            return this.filenameAllowed(filename);
        });

        numSongs = filenames.length;

        filenames.forEach(filename =>
        {
            bigintStat(filename, 
                (err : Error, stat : fs.Stats) =>
                {
                    if (err)
                    {
                        throw err;
                        // TODO: locate missing songs
                    }

                    this.makeSong(filename, stat, check);
                });
        });
    }

    private loadFromFilenames(filenames : string[], callback? : () => void) : void
    {
        this.loadFromFilenamesHelper(filenames, callback);
    }

    private loadFromPathsHelper(path : string, callback : () => void)
    {
        dir.files(path, (err : any, files : string[]) =>
        {
            if (err)
            {
                throw err;
            }

            this.loadFromFilenamesHelper(files, callback);
        });
    }

    private loadFromPaths(paths : string[], callback? : () => void)
    {
        let numPaths = paths.length;
        let pathCounter = 0;

        paths = paths.map(path => npath.normalize(path));

        let check = () =>
        {
            pathCounter++;

            if (pathCounter === numPaths)
            {                    
                this.watcher = chokidar.watch(paths, {
                    ignoreInitial: true,
                    disableGlobbing: true,
                    alwaysStat: false,
                    awaitWriteFinish: {
                        stabilityThreshold: 3000,
                        pollInterval: 100
                    }
                });
                
                this.watcher.on("add", this.handleSongAdded.bind(this));
                this.watcher.on("change", this.handleSongChanged.bind(this));
                this.watcher.on("unlink", this.handleSongRemoved.bind(this));

                callback && callback();
            }
        };

        paths.forEach(path =>
        {
            if (!fileExists(path))
            {
                throw "path not found: " + path;
            }
            else
            {
                this.loadFromPathsHelper(path, check);
            }
        });
    }

    public static writeCache(cb? : (err : Error) => void) : void
    {
        SafeWriter.write(this.cacheFilename, JSON.stringify(this.metadata), cb, this.cacheFid);
    }

    private getSorted(songs : Song[], sortFn? : (a : Song, b : Song) => boolean) : Song[]
    {
        //console.log("aaaa", sortFn || this.sortFn);
        return mergeSorted(songs, sortFn || this.sortFn);
    }

    private filenameAllowed(filename : string) : boolean
    {
        let ret = this.allowedExtensions.some(ext => endsWith(filename.toLowerCase(), ext));

        if (!ret)
        {
            console.log(filename + " not allowed!!!");
        }

        return ret;
    }

    private makeSong(filename : string, stat : fs.Stats, onload : (song : Song) => void)
    {
        let metadata : Metadata = null;
        let fid = stat.ino.toString();
        
        if (Songs.metadata.hasOwnProperty(fid))
        {
            metadata = Songs.metadata[fid];
        }

        let song = new Song(filename, stat, metadata);
        song.once("load", () =>
        {
            Songs.metadata[song.fid] = song.metadata;
            onload.call(this, song);
        });
        song.load();
    }

    private removeSong(song : Song, rerender : boolean = true) : boolean
    {
        let existed = array_remove(this.songs, song).existed;
        array_remove(this._filteredSongs, song);
        this.emitEvent("remove", song);
        rerender && this.emitEvent("change");

        return existed;
    }

    public removeSongsFromPlaylist(...songs : Song[])
    {
        songs.forEach(song => this.removeSong(song, false));
        this.updateSourcePlaylist();
        this.emitEvent("change");
    }

    private updateSourcePlaylist() : void
    {
        let p = this.toPlaylist();
        for (let key in this._loadedFrom)
        {
            this._loadedFrom[key] = p[key];
        }

        this.emitEvent("playlistupdate");
    }

    private handleSongAdded(filename : string)
    {
        filename = npath.normalize(filename);
        if (!this.filenameAllowed(filename))
        {
            return;
        }
        
        bigintStat(filename, (err : Error, stat : fs.Stats) =>
        {
            if (err)
            {
                throw err;
            }

            let song = this.findSongByFid(stat.ino.toString());

            if (!song)
            {
                console.log("song added: " + filename);
                this.makeSong(filename, stat, (song) =>
                {
                    this.emitEvent("add", song);
                    this.resortSong(song);
                });
            }
            else
            {
                console.log("song... added?: " + filename);
                this.emitEvent("add", song);
                this.resortSong(song);
            }
        });
    }

    private handleSongChanged(filename : string)
    {
        filename = npath.normalize(filename);
        
        bigintStat(filename, (err : Error, stat : fs.Stats) =>
        {
            if (err)
            {
                throw err;
            }

            let fid = stat.ino.toString();
            let song = this.findSongByFid(fid);

            if (song)
            {
                console.log("song changed: " + filename);
                if (filename !== song.filename)
                {
                    song.renameShallow(filename);
                }

                song.retrieveMetadata(() =>
                {
                    if (array_contains(this.songs, song))
                    {
                        this.resortSong(song);
                    }
                });
            }
        });
    }

    private handleSongRemoved(filename : string)
    {
        console.log("song removed: " + filename);
        let song = this.findSongByFilename(filename);

        if (song)
        {
            this.removeSong(song);
        }
    }

    // call to add a song or re-sort a song (if metadata changes, etc) after initial loading //
    private resortSong(song : Song) : void
    {
        if (this._loading)
        {
            this.once("load", () =>
            {
                this.resortSong(song);
            });

            return;
        }

        let { existed, index } = array_remove(this.songs, song);
        array_remove(this._filteredSongs, song);

        if (!this.permFilter || song.matchesFilter(this.permFilter))
        {
            array_insert(this.songs, song, this.sortFn === this.noSort ? index : this.sortFn);
    
            if (song.matchesFilter(this._filter))
            {
                array_insert(this._filteredSongs, song, this.sortFn);
            }
    
            if (!existed && this.shuffled)
            {
                array_insert_random(this.shuffledIndeces, this.songs.length - 1);
            }
        }

        //this.sort(this.sortFn, true);

        this.emitEvent("change");
        Songs.writeCache();
    }

    public moveSong(song : Song, amount : number) : boolean
    {
        if (amount === 0) return true;

        while (amount > 0)
        {
            let index = this.filteredSongs.indexOf(song);
            let next = this.filteredSongs[index + 1];

            if (!next)
            {
                return false;
            }
            else
            {
                array_swap(this.filteredSongs, index, index + 1);
                array_swap(this.songs, song, next);
            }

            amount--;
        }

        while (amount < 0)
        {
            let index = this.filteredSongs.indexOf(song);
            let prev = this.filteredSongs[index - 1];

            if (!prev)
            {
                return false;
            }
            else
            {
                array_swap(this.filteredSongs, index, index - 1);
                array_swap(this.songs, song, prev);
            }

            amount++;
        }

        this.emitEvent("change");
        return true;
    }

    public getRenderList() : Song[]
    {
        if (this._previewFilter)
        {
            return this.getFilterList(this._previewFilter);
        }
        else
        {
            return array_copy(this.filteredSongs);
        }
    }

    private getFilterList(filter : string, fromArray? : Song[]) : Song[]
    {
        filter = filter.toLowerCase();
        if (fromArray === undefined)
        {
            fromArray = this.songs;
        }

        filter = filter.replace(/\(\)/g, "");

        if (filter === "")
        {
            return array_copy(fromArray);
        }

        return fromArray.filter(song => 
        {
            return song.matchesFilter(filter);
        });
    }
}