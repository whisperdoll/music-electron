import { Widget } from "./widget";
import { Dialog } from "./dialog";
import { Playlist } from "./playlist";
import { array_remove, array_last, revealInExplorer, isFileNotFoundError, array_contains, array_item_at, array_insert, SortFunction, element_scrollIntoViewIfNeeded } from "./util";
import { PlaylistData } from "./playlistdata";
import { Song } from "./song";
import { SongView } from "./songview";

export class PlaylistView extends Widget
{
    private songViewPool : SongView[] = [];
    private songViewMap : Map<Song, SongView> = new Map<Song, SongView>();
    private _renderedSongViews : SongView[] = [];
    private constructed : boolean = false;

    private dragging : boolean = false;
    private dragOrigin : { x : number, y : number };

    private _playlist : Playlist;

    constructor(playlist : Playlist)
    {
        super("songList");

        this.createEvent("dblclicksong");
        this.createEvent("rightclick");
        this.createEvent("construct");

        this._playlist = playlist;

        this.playlist.on("load", this.construct.bind(this));
        this.playlist.on("update", () => this.update());

        this.container.addEventListener("mousemove", this.mousemoveFn.bind(this));
        this.container.addEventListener("mouseup", this.mouseupFn.bind(this));
        this.container.addEventListener("contextmenu", e => this.emitEvent("rightclick", e));
        
        this.container.addEventListener("keydown", (e) =>
        {
            let currentSelection = this.playlist.currentSelection;

            if (this.playlist.currentSelection.length === 0)
            {
                return;
            }

            if (e.which === 38) // up
            {
                e.preventDefault();
                this.playlist.shiftSelection(-1);
                element_scrollIntoViewIfNeeded(this.songViewMap.get(currentSelection[0]).container, "top", false);
            }
            else if (e.which === 40) // down
            {
                e.preventDefault();
                this.playlist.shiftSelection(1);
                element_scrollIntoViewIfNeeded(this.songViewMap.get(array_last(currentSelection)).container, "bottom", false);
            }
        });
    }

    public get playlist() : Playlist
    {
        return this._playlist;
    }

    public scrollIntoView(song : Song) : void
    {
        this.songViewMap.get(song).container.scrollIntoView({
            behavior: "smooth"
        });
    }

    private constructSongView(song : Song) : SongView
    {
        if (this.songViewPool.length > 0)
        {
            let songView = this.songViewPool.splice(0, 1)[0];
            songView.song = song;
            return songView;
        }
        else
        {
            let songView = new SongView(song);
            songView.on("mousedown", (songView : SongView, e : MouseEvent) => this.songViewMouseDownFn(songView, e));
            songView.on("dblclick", (songView : SongView, e : MouseEvent) => this.emitEvent("dblclicksong", songView, e));
            return songView;
        }
    }

    public construct()
    {
        console.time("constructing playlist");
        
        this.songViewMap.forEach((songView) =>
        {
            this.songViewPool.push(songView);
        });

        this.songViewMap.clear();

        let frag = document.createDocumentFragment();

        this.playlist.songs.forEach(song =>
        {
            let songView = this.constructSongView(song);
            this.songViewMap.set(song, songView);
            frag.appendChild(songView.container);
        });

        this.appendChild(frag);
        this.constructed = true;
        this.emitEvent("construct");
        console.timeEnd("constructing playlist");
        this.update();
    }

    public update() : void
    {
        if (!this.constructed)
        {
            return;
        }

        this._renderedSongViews = this.playlist.visibleSongs.map(song => this.songViewMap.get(song));
        console.time("rendering " + this._renderedSongViews.length + " songs");
        
        this.clear();
        
        this._renderedSongViews.forEach((songView, i) =>
        {
            if ((i & 1) === 0)
            {
                songView.container.classList.add("even");
            }
            else
            {
                songView.container.classList.remove("even");
            }
        });

        this.appendChild(...this._renderedSongViews);
        console.timeEnd("rendering " + this._renderedSongViews.length + " songs");
    }

    public get renderedSongs() : SongView[]
    {
        return this._renderedSongViews;
    }

    private songViewMouseDownFn(songView : SongView, e : MouseEvent) : void
    {        
        if (e.shiftKey)
        {
            this.playlist.selectTo(songView.song, !e.ctrlKey);
        }
        else if (e.ctrlKey)
        {
            this.playlist.toggleSelect(songView.song);
        }
        else
        {
            if (e.button === 0 || !array_contains(this.playlist.currentSelection, songView.song))
            {
                this.playlist.select([ songView.song ], true);
            }

            if (e.button === 0)
            {
                this.dragging = true;
                this.dragOrigin = { x: e.clientX, y: e.clientY };
            }
        }
    }

    private viewFor(song : Song)
    {
        return this.songViewMap.get(song);
    }

    private mousemoveFn(e : MouseEvent)
    {
        if (this.dragging)
        {
            let dx = e.clientX - this.dragOrigin.x;
            let dy = e.clientY - this.dragOrigin.y;
            let h = this.songViewMap.get(this.playlist.songs[0]).container.getBoundingClientRect().height;

            if (dy >= h)
            {
                if (this.viewFor(array_last(this.playlist.currentSelection)).container.nextElementSibling)
                {
                    this.playlist.moveSongs(this.playlist.currentSelection, Math.floor(dy / h));

                    dy %= h;
                    this.dragOrigin.y = e.clientY - dy;
                }
            }
            else if (dy <= -h)
            {
                if (this.viewFor(this.playlist.currentSelection[0]).container.previousElementSibling)
                {
                    this.playlist.moveSongs(this.playlist.currentSelection, Math.ceil(dy / h));

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