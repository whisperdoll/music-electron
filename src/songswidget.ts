import { Widget } from "./widget";
import { SongWidget } from "./songwidget";
import { Dialog } from "./dialog";
const edialog = require("electron").remote.dialog;
import * as fs from "fs";
import * as npath from "path";
import { Songs, Playlist } from "./songs";
import * as archiver from "archiver";
import { array_remove, array_last, revealInExplorer, isFileNotFoundError, array_contains, array_item_at, array_insert, SortFunction } from "./util";
import { Song } from "./song";

export class SongsWidget extends Widget
{
    private _songs : Songs;
    private songWidgets : Map<Song, SongWidget> = new Map<Song, SongWidget>();
    public currentSelection : SongWidget[] = [];
    private _renderedSongs : SongWidget[] = [];
    private constructed : boolean = false;

    private dragging : boolean = false;
    private dragOrigin : { x : number, y : number };

    private zipOverlay : Dialog;

    constructor(container? : HTMLElement)
    {
        super(container || "songList");

        this.createEvent("construct");
        this.createEvent("click");
        this.createEvent("dblclick");
        this.createEvent("rightclick");

        this._songs = new Songs();
        this.songs.on("load", this.construct.bind(this));
        this.songs.on("change", this.render.bind(this));
        this.songs.on("add", (song : Song) =>
        {
            let songWidget = this.constructSongWidget(song);
            this.songWidgets.set(song, songWidget);
        });
        this.songs.on("remove", (song : Song) =>
        {
            array_remove(this.currentSelection, this.songWidgets.get(song));
            this.songWidgets.delete(song);
        });

        this.container.addEventListener("mousemove", this.mousemoveFn.bind(this));
        this.container.addEventListener("mouseup", this.mouseupFn.bind(this));

        this.zipOverlay = new Dialog(false);
        this.zipOverlay.appendHTML("Please wait,,,");
        document.body.appendChild(this.zipOverlay.container);
    }

    public isPlaylist(playlist : Playlist) : boolean
    {
        return this.songs && this.songs.isPlaylist(playlist);
    }

    public loadFromPlaylist(playlist : Playlist)
    {
        this.constructed = false;
        this.songs.loadFromPlaylist(playlist);
    }

    public set songs(songs : Songs)
    {
        this._songs = songs;
    }

    public get songs() : Songs
    {
        return this._songs;
    }

    public songAfter(songWidget : SongWidget) : SongWidget
    {
        return this.songWidgets.get(this.songs.songAfter(songWidget.song));
    }

    public songBefore(songWidget : SongWidget) : SongWidget
    {
        return this.songWidgets.get(this.songs.songBefore(songWidget.song));
    }

    public get firstSong() : SongWidget
    {
        return this.songWidgets.get(this.songs.filteredSongs[0]);
    }

    public get currentSelectionSongs() : Song[]
    {
        return this.currentSelection.map(songWidget => songWidget.song);
    }

    private constructSongWidget(song : Song) : SongWidget
    {
        let songWidget = new SongWidget(song);
        songWidget.on("click", (song : SongWidget, e : MouseEvent) => this.songClickFn(song, e));
        songWidget.on("mousedown", (song : SongWidget, e : MouseEvent) => this.songMousedownFn(song, e));
        songWidget.on("dblclick", (song : SongWidget, e : MouseEvent) => this.emitEvent("dblclick", song, e));
        songWidget.on("rightclick", (song : SongWidget, e : MouseEvent) => this.emitEvent("rightclick", song, e));
        return songWidget;
    }

    private construct()
    {
        this.songWidgets.clear();

        let frag = document.createDocumentFragment();

        this.songs.songs.forEach(song =>
        {
            let songWidget = this.constructSongWidget(song);
            this.songWidgets.set(song, songWidget);
            frag.appendChild(songWidget.container);
        });

        this.appendChild(frag);
        this.constructed = true;
        this.emitEvent("construct");
        this.render();
    }

    private render() : void
    {
        if (!this.constructed)
        {
            return;
        }

        this._renderedSongs = this.songs.getRenderList().map(song => this.songWidgets.get(song));
        console.log("rendering: " + this._renderedSongs.length + " songs");

        this.container.innerHTML = "";
        
        this._renderedSongs.forEach((song, i) =>
        {
            if ((i & 1) === 0)
            {
                song.container.classList.add("even");
            }
            else
            {
                song.container.classList.remove("even");
            }
        });

        this.appendChild(...this._renderedSongs);
    }

    public exportZip()
    {
        let savePath = edialog.showSaveDialog(
            {
                filters:
                [
                    {
                        name: "ZIP file",
                        extensions: [ "zip" ]
                    }
                ]
            }
        );

        if (!savePath)
        {
            return;
        }

        this.zipOverlay.show();

        let output = fs.createWriteStream(savePath);
        let archive = archiver("zip");

        output.on("close", () =>
        {
            this.zipOverlay.hide();
            revealInExplorer(savePath);
        });

        archive.on("warning", (err) =>
        {
            if (isFileNotFoundError(err))
            {
                console.log(err);
            }
            else
            {
                throw err;
            }
        });

        archive.on("error", (err) =>
        {
            throw err;
        });

        archive.pipe(output);

        let filenames = this.songs.filenames;
        
        filenames.forEach((filename, i) =>
        {
            let pad = Math.max(2, filenames.length.toString().length);

            archive.file(filename, { name: i.toString().padStart(pad, "0") + " - " + npath.basename(filename) });
        });

        archive.finalize();
    }

    public get sortFn() : SortFunction<SongWidget>
    {
        return (left : SongWidget, right : SongWidget) =>
        {
            return this.songs.sortFn(left.song, right.song);
        };
    }

    public select(song : SongWidget, removeOthers : boolean = false) : void
    {
        if (this.currentSelection.length > 0)
        {
            if (removeOthers)
            {
                this.deselectAll();
                this.select(song);
                return;
            }
            else if (this.currentSelection.indexOf(song) === -1)
            {
                array_insert(this.currentSelection, song, this.sortFn);
                this.doSelectThings(song);
            }
        }
        else
        {
            this.currentSelection = [ song ];
            this.doSelectThings(song);
        }
    }

    public shiftSelection(amount : number)
    {
        let newIndexes = [];

        while (this.currentSelection.length > 0)
        {
            let song = this.currentSelection[0];
            this.deselect(song, true);
            newIndexes.push(this.renderedSongs.indexOf(song) + amount);
        }

        newIndexes.forEach(newIndex =>
        {
            this.select(array_item_at(this.renderedSongs, newIndex), false);
        });
    }

    public selectRange(song1 : SongWidget, song2: SongWidget, removeOthers : boolean = false) : void
    {
        if (removeOthers)
        {
            this.deselectAll();
        }

        let sort = this.songs.sortFn(song1.song, song2.song);
        let firstSong : SongWidget, lastSong : SongWidget;

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

        let firstIndex = this.renderedSongs.indexOf(firstSong);
        let lastIndex = this.renderedSongs.indexOf(lastSong);

        let toAdd = this.renderedSongs.slice(firstIndex, lastIndex + 1);
        toAdd = toAdd.filter(song => this.currentSelection.indexOf(song) === -1);
        toAdd.forEach(song =>
        {
            this.doSelectThings(song);
        });

        this.currentSelection.push(...toAdd);
    }

    // called by selection functions //
    private doSelectThings(song : SongWidget)
    {
        song.container.classList.add("selected");
    }

    public selectTo(song : SongWidget) : void
    {
        if (this.currentSelection.length === 0)
        {
            this.select(song);
        }
        else if (this.currentSelection.length === 1)
        {
            this.selectRange(song, this.currentSelection[0]);
        }
        else
        {
            let firstIndex = this.renderedSongs.indexOf(this.currentSelection[0]);
            let lastIndex = this.renderedSongs.indexOf(this.currentSelection[this.currentSelection.length - 1]);
            let songIndex = this.renderedSongs.indexOf(song);
            
            if (songIndex >= firstIndex && songIndex <= lastIndex)
            {
                return;
            }
            else if (songIndex < firstIndex)
            {
                this.selectRange(song, this.renderedSongs[lastIndex]);
            }
            else
            {
                this.selectRange(song, this.renderedSongs[firstIndex]);
            }
        }
    }

    public selectAll() : void
    {
        this.selectRange(this.renderedSongs[0], array_last(this.renderedSongs));
    }

    public deselect(song : SongWidget, remove : boolean = true) : void
    {
        song.container.classList.remove("selected");
        if (remove)
        {
            array_remove(this.currentSelection, song);
        }
    }

    public deselectAll() : void
    {
        this.currentSelection.forEach(song =>
        {
            song.container.classList.remove("selected");
        });

        this.currentSelection = [];
    }

    public get renderedSongs() : SongWidget[]
    {
        return this._renderedSongs;
    }

    // only to be called by song container's onclick //
    private songClickFn(song : SongWidget, e : MouseEvent) : void
    {
        e.stopPropagation();

        if (e.shiftKey)
        {
            if (e.ctrlKey && this.currentSelection.length > 0)
            {
                let sorted = this.renderedSongs;

                let getDist = (song1 : SongWidget, song2 : SongWidget) =>
                {
                    return Math.abs(sorted.indexOf(song1) - sorted.indexOf(song2));
                }

                let closest : SongWidget = this.currentSelection[0];
                let closestDist = getDist(song, closest);
                
                this.currentSelection.forEach(sSong =>
                {
                    let dist = getDist(sSong, song);
                    if (dist < closestDist)
                    {
                        closest = sSong;
                        closestDist = dist;
                    }
                });

                this.selectRange(song, closest, false);
            }
            else
            {
                this.selectTo(song);
            }
        }
        else if (e.ctrlKey)
        {
            if (array_contains(this.currentSelection, song))
            {
                this.deselect(song, true);
            }
            else
            {
                this.select(song, false);
            }
        }
        else
        {
            this.select(song, true);
        }

        this.emitEvent("click", song, e);
    }

    private songMousedownFn(song : SongWidget, e : MouseEvent) : void
    {
        if (array_contains(this.currentSelection, song) && this.songs.type === "songList")
        {
            this.dragging = true;
            this.dragOrigin = { x: e.clientX, y: e.clientY };
        }
    }

    private mousemoveFn(e : MouseEvent)
    {
        if (this.dragging)
        {
            let dx = e.clientX - this.dragOrigin.x;
            let dy = e.clientY - this.dragOrigin.y;
            let h = this.songWidgets.get(this.songs.songs[0]).container.getBoundingClientRect().height;

            if (dy >= h)
            {
                if (array_last(this.currentSelection).container.nextElementSibling)
                {
                    this.currentSelection.forEach(song =>
                    {
                        this.songs.moveSong(song.song, ~~(dy / h));
                    });

                    dy %= h;
                    this.dragOrigin.y = e.clientY - dy;
                }
            }
            else if (dy <= -h)
            {
                if (this.currentSelection[0].container.previousElementSibling)
                {
                    this.currentSelection.forEach(song =>
                    {
                        this.songs.moveSong(song.song, Math.ceil(dy / h));
                    });

                    dy = -((-dy) % h);
                    this.dragOrigin.y = e.clientY - dy;
                }
            }
        }
    }

    private mouseupFn() : void
    {
        this.dragging = false;
    }
}