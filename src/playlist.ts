import { endsWith, mergeSorted, array_copy, array_shuffle, SortFunction, array_swap, getUserDataPath, array_item_at, bigintStat, bigintStatSync, emptyFn, array_remove_multiple, isFile, array_contains, numberArray, array_last, array_remove_at, array_remove, mod } from "./util";
const dir = require("node-dir");
import * as fs from "fs";
import * as npath from "path";
import { SafeWriter } from "./safewriter";
import { EventClass } from "./eventclass";
import { Song, Metadata } from "./song";
import { PlaylistData, PlaylistPath } from "./playlistdata";
import { FilterInfo } from "./filter";

export class Playlist extends EventClass
{
    private noSort = (left : Song, right : Song) =>
    {
        let lindex = this.songs.indexOf(left);
        return lindex !== -1 && lindex < this.songs.indexOf(right);
    };

    public static allowedExtensions : string[] =
    [
        "mp3",
        "m4a"
    ];
    
    public songs : Song[] = [];
    private filterInfo : FilterInfo;
    public filteredSongs : Song[] = [];
    public visibleSongs : Song[] = [];

    private songPathMap : Map<Song, string> = new Map<Song, string>();
    private _playlistData : PlaylistData;
    private _loaded : boolean = false;
    private _loading : boolean = false;
    private shuffled : boolean = false;
    private shuffledIndeces : number[];
    private sortFn : SortFunction<Song> = this.noSort;

    constructor(private savePlaylistFn : (playlist : PlaylistData) => void)
    {
        super();

        this.createEvent("loadstart");
        this.createEvent("load");
        this.createEvent("loadchunk");
        this.createEvent("reset");
        this.createEvent("selectionchange");
        this.createEvent("update");
    }

    public reset(callback : Function) : boolean
    {
        this.songs = [];
        this.visibleSongs = [];
        this.filteredSongs = [];
        this.songPathMap.clear();
        this._playlistData = null;
        this._loaded = false;
        this.filterInfo = null;
        this.emitEvent("reset");
        callback();
        return true;
    }

    // returns undefined if song is not a child of path //
    public songParentPath(song : Song) : string
    {
        return this.songPathMap.get(song);
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
        let queue : PlaylistPath[] = [];

        let loadSong = (playlistPath : PlaylistPath, addTo : Song[] = this.songs, callback? : (song : Song) => void) =>
        {
            let filename = playlistPath.path;
            if (!playlistPath.exclude)
            {
                playlistPath.exclude = [];
            }
            if (this.filenameAllowed(filename) && !array_contains(playlistPath.exclude, filename))
            {
                let s = new Song(filename);
                s.once("load", () =>
                {
                    if (s.matchesFilter(this.playlistData.filter) && s.matchesFilter(playlistPath.filter))
                    {
                        addTo.push(s);
                    }
                    
                    if (callback)
                    {
                        callback && callback(s);
                    }
                    else
                    {
                        this.emitEvent("loadchunk");
                    }
                });
                s.load();
            }
            else
            {
                if (callback)
                {
                    callback && callback(null);
                }
                else
                {
                    this.emitEvent("loadchunk");
                }
            }
        };

        let loadPath = (playlistPath : PlaylistPath) =>
        {
            let filenames : string[] = dir.files(playlistPath.path, { sync: true });
            let counter = 0;
            let toAdd : Song[] = [];

            filenames.forEach((filename) =>
            {
                loadSong({ path: filename, filter: playlistPath.filter, exclude: playlistPath.exclude }, toAdd, (song) =>
                {
                    counter++;
                    song && this.songPathMap.set(song, playlistPath.path);
                    if (counter === filenames.length)
                    {
                        if (playlistPath.sort)
                        {
                            toAdd = mergeSorted(toAdd, this.getSortFunctionByCriteria(playlistPath.sort.split(",")));
                        }

                        this.songs.push(...toAdd);
                        this.emitEvent("loadchunk");
                    }
                });
            });
        };

        let done = () =>
        {
            this._loading = false;
            this._loaded = true;
            if (this.playlistData.sort)
            {
                let sortStrings : string[] = this.playlistData.sort.split(",");
                this.songs = mergeSorted(this.songs, this.getSortFunctionByCriteria(sortStrings));
            }
            this.filter({ appliedPart: "", previewPart: "" }, false); // initalize filtered songlists
            this.emitEvent("load");
            console.timeEnd("loading playlist " + this.playlistData.name);
        };

        let loadFn = () =>
        {
            if (queue.length === 0)
            {
                done();
                return;
            }

            let playlistPath = queue.shift();
            if (isFile(playlistPath.path))
            {
                loadSong(playlistPath);
            }
            else
            {
                loadPath(playlistPath);
            }
        };

        this.reset(() =>
        {
            console.time("loading playlist " + playlistData.name);
            this._loading = true;
            this._playlistData = playlistData;
            this.emitEvent("loadstart");

            queue = array_copy(playlistData.paths);

            this.only("loadchunk", loadFn);
            loadFn();
        });
    }

    public get loaded() : boolean
    {
        return this._loaded;
    }

    public get filenames() : string[]
    {
        return this.songs.map(song => song.filename);
    }

    public filter(filterInfo : FilterInfo, shouldUpdate : boolean = true, force : boolean = false) : void
    {
        if (force || !this.filterInfo || filterInfo.appliedPart !== this.filterInfo.appliedPart)
        {
            // only apply filter if it's different from the last one //
            this.filteredSongs = this.songs.filter(song => song.matchesFilter(filterInfo.appliedPart));
        }
        
        if (force || !this.filterInfo || (filterInfo.previewPart !== this.filterInfo.previewPart && filterInfo.appliedPart === this.filterInfo.appliedPart) || filterInfo.appliedPart !== this.filterInfo.appliedPart)
        {
            // only apply preview if different from last one and the applied part is the same //
            // (cuz applied part changing would change the pool that preview draws from) //
            this.visibleSongs = this.filteredSongs.filter(song => song.matchesFilter(filterInfo.previewPart));
        }

        this.filterInfo = filterInfo;
        shouldUpdate && this.emitEvent("update");
    }

    private getSortFunctionByCriteria(sortStrings : string[]) : SortFunction<Song>
    {
        return (a : Song, b : Song) =>
        {    
            for (let i = 0; i < sortStrings.length; i++)
            {
                let criterium = sortStrings[i].split(":")[0];
                let order = sortStrings[i].split(":")[1] || "a";
                let pa = a.getProperty(criterium);
                let pb = b.getProperty(criterium);

                if (pa === pb)
                {
                    continue;
                }
                else
                {
                    return !!(+(pa >= pb) ^ +(order[0] === "a")); // lol huh ???
                }
            }

            return false;
        };
    }

    public shuffle() : void
    {
        this.shuffledIndeces = numberArray(0, this.songs.length);
        array_shuffle(this.shuffledIndeces);
        this.shuffled = true;
    }

    public unshuffle() : void
    {
        this.shuffled = false;
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

    public get currentSelection() : Song[]
    {
        return this.songs.filter(song => song.selected);
    }

    public select(songs : Song[], removeOthers : boolean) : void
    {
        removeOthers && this.deselectAll();
        songs.forEach(song => song.selected = true);
        this.emitEvent("selectionchange");
    }

    public selectAll() : void
    {
        this.select(this.songs, false);
    }

    public deselect(songs : Song[]) : void
    {
        songs.forEach(song => song.selected = false);
        this.emitEvent("selectionchange");
    }

    public deselectAll() : void
    {
        this.deselect(this.songs);
    }

    public selectRange(song1 : Song, song2: Song, removeOthers : boolean) : void
    {
        let sort = this.sortFn(song1, song2);
        let firstSong : Song, lastSong : Song;

        if (sort)
        {
            firstSong = song1;
            lastSong = song2;
        }
        else
        {
            firstSong = song2;
            lastSong = song1;
        }

        let firstIndex = this.visibleSongs.indexOf(firstSong);
        let lastIndex = this.visibleSongs.indexOf(lastSong);

        let toAdd = this.visibleSongs.slice(firstIndex, lastIndex + 1);
        this.select(toAdd, removeOthers);
    }

    // returns the closest selected song to the passed song //
    public closestSelectedTo(song : Song)
    {
        let getDist = (song1 : Song, song2 : Song) =>
        {
            return Math.abs(this.visibleSongs.indexOf(song1) - this.visibleSongs.indexOf(song2));
        };
        
        let currentSelection = this.currentSelection;

        let closest : Song = currentSelection[0];
        let closestDist = getDist(closest, song);

        for (let i = 1; i < currentSelection.length; i++)
        {
            let dist = getDist(currentSelection[i], song);
            if (dist < closestDist)
            {
                closest = currentSelection[i];
                closestDist = dist;
            }
        }

        return closest;
    }

    // select from current selection to passed song //
    public selectTo(song : Song, removeOthers : boolean)
    {
        let currentSelection = this.currentSelection;

        if (currentSelection.length === 0)
        {
            this.selectRange(song, this.visibleSongs[0], removeOthers);
        }
        else if (this.currentSelection.length === 1)
        {
            this.selectRange(song, currentSelection[0], removeOthers);
        }
        else
        {
            let closest = this.closestSelectedTo(song);
            this.selectRange(song, closest, removeOthers);
        }
    }

    public shiftSelection(amount : number)
    {
        let newSongs : Song[] = [];

        let currentSelection = this.currentSelection;

        currentSelection.forEach((song) =>
        {
            newSongs.push(this.visibleSongs[this.visibleSongs.indexOf(song) + amount]);
        });
        
        this.deselect(currentSelection);
        this.select(newSongs, false);
    }

    public toggleSelect(song : Song) : void
    {
        song.selected = !song.selected;
    }

    public removeSongs(songs : Song[]) : void
    {
        songs.forEach((song) =>
        {
            let parentPath : string;

            if (parentPath = this.songParentPath(song))
            {
                // exclude from path //
                this.playlistData.paths.find(pathInfo => pathInfo.path === parentPath).exclude.push(song.filename);
            }
            else
            {
                // remove from playlist
                let pathInfo = this.playlistData.paths.find(pathInfo => pathInfo.path === song.filename);
                array_remove(this.playlistData.paths, pathInfo);
            }
        });

        this.savePlaylistFn(this.playlistData);

        array_remove_multiple(this.songs, songs);
        array_remove_multiple(this.filteredSongs, songs);
        array_remove_multiple(this.visibleSongs, songs);
        this.emitEvent("update");
    }

    public removeSelected() : void
    {
        this.removeSongs(this.currentSelection);
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

    public moveSongs(songs : Song[], direction : number)
    {
        songs = mergeSorted(songs, (l, r) => this.visibleSongs.indexOf(l) > this.visibleSongs.indexOf(r));

        for (let i = songs.length - 1; i >= 0; i--)
        {
            // swap song for the one after it //
            let songIndex = this.songs.indexOf(songs[i]);
            let swapIndex = mod(this.songs.indexOf(songs[i]) + direction, this.songs.length);
            let swapSong = this.songs[swapIndex];
            this.songs[swapIndex] = songs[i];
            this.songs[songIndex] = swapSong;
        }

        this.filter(this.filterInfo, true, true);
    }
}