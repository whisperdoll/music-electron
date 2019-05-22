import { Widget } from "./widget";
import { Songs, Playlist } from "./songs";
import { Player } from "./player";
import { BottomBar } from "./bottombar";
import { Filter } from "./filter";
import { createElement, array_copy, array_contains, hideElement, showElement, array_last, element_scrollIntoViewIfNeeded, array_remove_all, revealInExplorer } from "./util";
import { Song } from "./song";
import { RenameRule } from "./renamerule";
import { ContextMenu, ContextMenuItem } from "./contextmenu";
import { RenameDialog } from "./renamedialog";
import { Spectrum } from "./spectrum";
import { PlaylistDialog } from "./playlistdialog";
import { Playlists } from "./playlists";
import { InputDialog } from "./inputdialog";
import { SongsWidget } from "./songswidget";
import { SongWidget } from "./songwidget";

export class MainPlayer extends Widget
{
    private filter : Filter;
    private songs : SongsWidget;
    private playlists : Playlists;
    private player : Player;
    private bottomBar : BottomBar;
    private songMenu : ContextMenu;
    private playlistMenu : ContextMenu;
    private removeFromPlaylistItem : ContextMenuItem;
    private renameDialog : RenameDialog;
    private playlistDialog : PlaylistDialog;
    private spectrum : Spectrum;

    private currentSong : SongWidget;
    private songCountSwitch : boolean = false;

    private backgroundOverlay : HTMLElement;
    private backgroundPicture : HTMLElement;
    private loadingElement : HTMLImageElement;

    private skipOnceSongs : SongWidget[] = [];

    constructor(container : HTMLElement)
    {
        super(container);

        this.filter = new Filter(createElement("div", "filter-container"));
        this.playlists = new Playlists(createElement("div", "playlists"));
        this.songs = new SongsWidget(createElement("div", "songList"));
        this.bottomBar = new BottomBar(createElement("div", "bottomPanel"));
        this.player = new Player(this.bottomBar.wavebar);
        this.spectrum = new Spectrum();

        this.renameDialog = new RenameDialog(((err : NodeJS.ErrnoException) =>
        {
            if (err)
            {
                window.alert(err);
                throw err;
            }

            this.renameDialog.hide();
        }).bind(this));

        this.playlistDialog = new PlaylistDialog(
            (err) =>
            {
                if (err)
                {
                    window.alert(err);
                    throw err;
                }

                this.playlistDialog.hide();
            },
            (playlist : Playlist) =>
            {
                if (playlist)
                {
                    this.playlists.add(playlist, this.playlistDialog.isEditing);
                }
            }
        );

        this.songMenu = new ContextMenu();
        this.songMenu.addItem(new ContextMenuItem("Rename...", this.promptRename.bind(this)));
        this.songMenu.addItem(new ContextMenuItem("Edit rules...", this.editRules.bind(this)));
        this.songMenu.addItem(new ContextMenuItem("Reveal in explorer", this.revealInExplorer.bind(this)));
        this.songMenu.addItem(new ContextMenuItem("Skip once", this.skipSongOnce.bind(this)));

        this.playlistMenu = new ContextMenu();
        let playListItem = new ContextMenuItem("Add to playlist");
        playListItem.subMenu = this.playlistMenu;
        this.songMenu.addItem(playListItem);

        this.removeFromPlaylistItem = new ContextMenuItem("Remove from playlist", this.removeFromPlaylist.bind(this));
        this.songMenu.addItem(this.removeFromPlaylistItem);

        this.backgroundPicture = createElement("div", "albumArt");
        this.backgroundOverlay = createElement("div", "albumOverlay");

        this.loadingElement = <HTMLImageElement>createElement("img", "loading");
        this.loadingElement.src = "./img/loading.gif";
        hideElement(this.loadingElement);

        this.appendChild(
            this.backgroundPicture,
            this.backgroundOverlay,
            this.filter,
            this.songs,
            this.playlists,
            this.bottomBar,
            this.songMenu,
            this.playlistMenu,
            this.spectrum,
            this.loadingElement,
            this.renameDialog,
            this.playlistDialog
        );

        this.songs.container.setAttribute("tabIndex", "0");

        let ipcRenderer = require("electron").ipcRenderer;
        ipcRenderer.on("app-command", this.processAppCommand.bind(this));

        (window as any).mainPlayer = this;
        (window as any).RenameRule = RenameRule;

        this.init();
    }

    private init() : void
    {
        //console.time("all loaded");

        /*this.songs.loadFromPath("D:\\Google Drive\\Music", () =>
        {
            //console.timeEnd("all loaded");
        
            this.loadingElement.style.display = "none";
        });*/

        this.playlists.on("load", () =>
        {
            /*if (!this.songs.loaded && this.playlists.defaultPlaylist)
            {
                this.songs.loadFromPlaylist(this.playlists.defaultPlaylist);
            }*/
        });

        this.playlists.on("addplaylist", (playlist : Playlist) =>
        {
            if (playlist.type === "songList")
            {
                let item = new ContextMenuItem(playlist.name, () =>
                {
                    if (!playlist.filenames)
                    {
                        playlist.filenames = [];
                    }

                    if (this.songs.songs.isPlaylist(playlist))
                    {
                        window.alert("idiot");
                        return;
                    }

                    this.songs.currentSelection.forEach(songWidget =>
                    {
                        playlist.filenames.push(songWidget.song.filename);
                    });

                    this.playlists.save(playlist);
                    this.playlists.updateLabels(playlist);
                });

                item.hint = playlist;

                this.playlistMenu.addItem(item);
            }
        });

        this.playlists.on("editplaylist", (playlist : Playlist) =>
        {
            this.playlistMenu.items.forEach(item =>
            {
                if (item.hint === playlist)
                {
                    item.text = playlist.name;
                }
            });

            if (this.songs.isPlaylist(playlist))
            {
                this.songs.loadFromPlaylist(playlist);
            }
        });

        this.playlists.on("playlistselect", (playlist : Playlist) =>
        {
            this.songMenu.hide();
            this.filter.clear(true);
            this.stopSong();

            this.songs.loadFromPlaylist(playlist);

            if (playlist.type === "pathList")
            {
                this.removeFromPlaylistItem.hide();
            }
            else
            {
                this.removeFromPlaylistItem.show();
            }
        });

        this.playlists.on("requestadd", () =>
        {
            this.playlistDialog.show();
        });

        this.playlists.on("requestedit", (playlist : Playlist) =>
        {
            this.playlistDialog.show(playlist);
        });

        this.playlists.on("requestdelete", (playlist : Playlist) =>
        {
            if (this.songs.songs.isPlaylist(playlist))
            {
                this.stopSong();
                this.songs.songs.reset();
                this.bottomBar.reset();
            }
        });

        this.songs.songs.on("loadstart", () =>
        {
            showElement(this.loadingElement);
        });

        this.songs.on("construct", () =>
        {
            hideElement(this.loadingElement);
        });

        this.songs.songs.on("playlistupdate", () =>
        {
            this.playlists.save(this.songs.songs.loadedFrom);
            this.playlists.updateLabels(this.songs.songs.loadedFrom);
        });

        this.songs.on("dblclick", (song : SongWidget, e : MouseEvent) =>
        {
            this.playSong(song, true);
        });

        this.songs.on("click", (song : SongWidget, e : MouseEvent) =>
        {
            // selection handled in songs.ts
        });

        this.songs.on("rightclick", (song : SongWidget, e : MouseEvent) =>
        {
            if (this.songs.currentSelection.length <= 1 || !array_contains(this.songs.currentSelection, song))
            {
                this.songs.select(song, true);
            }

            this.songMenu.show(e.clientX + 1, e.clientY + 1);
        });

        this.songs.container.addEventListener("keypress", e =>
        {
            if (e.which === 13) // enter
            {
                this.playSelected();
            }
            else
            {
                this.filter.value = "";
                this.filter.container.focus();
            }
        });

        this.songs.container.addEventListener("keydown", e =>
        {
            if (this.songs.currentSelection.length === 0)
            {
                return;
            }

            if (e.which === 38) // up
            {
                e.preventDefault();
                this.songs.shiftSelection(-1);
                element_scrollIntoViewIfNeeded(this.songs.currentSelection[0].container, "top", false);
            }
            else if (e.which === 40) // down
            {
                e.preventDefault();
                this.songs.shiftSelection(1);
                element_scrollIntoViewIfNeeded(array_last(this.songs.currentSelection).container, "bottom", false);
            }
        });

        this.player.on("songfinish", () =>
        {
            this.playNext();
        });
        
        this.player.on("load", () =>
        {
            this.spectrum.start(this.player.mediaElement);
        });

        this.player.on("listencount", () =>
        {
            // console.log("i'm dying");
            this.currentSong.song.metadata.plays++;
            Songs.writeCache();
        });

        this.filter.onpreview = (filter) =>
        {
            // console.log("preview: " + filter);
            this.songs.songs.previewFilter(filter, true);
        };

        this.filter.onfilter = (filter) =>
        {
            //console.log("filter: " + filter);
            this.songs.songs.filter(filter);
        };

        this.bottomBar.hookPlayer(this.player);

        this.bottomBar.onplaypressed = () =>
        {
            if (!this.currentSong)
            {
                return this.playSelected();
            }

            let success = this.playSong(this.currentSong);
            return success;
        };

        this.bottomBar.onpausepressed = () =>
        {
            this.player.pause();
        };

        this.bottomBar.onnextpressed = () =>
        {
            this.playNext();
        };
        
        this.bottomBar.onpreviouspressed = () =>
        {
            this.playPrevious();
        };

        this.bottomBar.on("primaryclick", () =>
        {
            this.scrollToCurrent();
        });

        this.bottomBar.on("shuffleon", () =>
        {
            this.songs.songs.shuffle();
        });

        this.bottomBar.on("shuffleoff", () =>
        {
            this.songs.songs.unshuffle();
        });
    }

    private showPlaylists() : void
    {
        this.playlists.show();
        this.songs.container.style.width = "calc(100% - " + this.playlists.container.getBoundingClientRect().width + "px)";
    }

    private hidePlaylists() : void
    {
        this.playlists.hide();
        this.songs.container.style.width = "100%";
    }

    private promptRename() : void
    {
        // console.log("hey- o!!!");
        if (this.songs.currentSelection.length > 0)
        {
            // console.log("hHELP!!");
            this.renameDialog.show(this.songs.currentSelectionSongs);
        }
    }

    private editRules() : void
    {
        alert("coming soon,,,");
    }

    private revealInExplorer() : void
    {
        if (this.songs.currentSelection.length > 0)
        {
            revealInExplorer(this.songs.currentSelection[0].song.filename);
        }
    }

    private skipSongOnce() : void
    {
        this.skipOnceSongs.push(...this.songs.currentSelection);
        this.songs.currentSelection.forEach(song =>
        {
            song.container.classList.add("skipping");
        });
    }

    private removeFromPlaylist() : void
    {
        this.songs.songs.removeSongsFromPlaylist(...this.songs.currentSelectionSongs);   
    }

    private scrollToCurrent() : void
    {
        if (this.currentSong)
        {
            this.currentSong.container.scrollIntoView({
                behavior: "smooth"
            });
        }
    }

    private set backgroundSrc(src : string)
    {
        (this.backgroundPicture.style as any)["background-image"] = src;
    }

    private playSelected() : boolean
    {
        if (this.songs.currentSelection.length === 0)
        {
            return this.playSong(this.songs.renderedSongs[0]);
        }
        else if (this.songs.currentSelection.length === 1)
        {
            return this.playSong(this.songs.currentSelection[0]);
        }
        else if (this.songs.currentSelection.length > 1)
        {
            let fids = this.songs.currentSelection.map(song => "fid:" + song.song.fid);
            let filterString = fids.join("|");
            this.filter.removeAllFilters();
            this.filter.addFilter(filterString);
            return this.playSong(this.songs.firstSong);
        }
    }

    private playSong(song : SongWidget, restart : boolean = false) : boolean
    {
        if (!song)
        {
            return false;
        }

        if (array_remove_all(this.skipOnceSongs, song).existed)
        {
            song.container.classList.remove("skipping");
            return this.playSong(this.songs.songAfter(song));
        }

        let success = this.player.play(song.song.filename, restart);

        if (success)
        {
            if (this.currentSong)
            {
                if (this.currentSong === song)
                {
                    return true;
                }

                this.currentSong.container.classList.remove("playing");
            }

            this.currentSong = song;
            this.currentSong.container.classList.add("playing");

            this.bottomBar.primaryString = song.song.metadata.title;
            this.bottomBar.secondaryString = song.song.metadata.artist + " — " + song.song.metadata.album;

            // scroll

            this.backgroundSrc = "url(" + JSON.stringify(song.song.metadata.picture) + ")";
        }

        return success;
    }

    private stopSong() : void
    {
        this.player.stop();
        this.backgroundSrc = "";
        this.bottomBar.reset();
    }

    private playNext() : boolean
    {
        return this.playSong(this.songs.songAfter(this.currentSong));
    }

    private playPrevious() : void
    {
        if (this.player.currentTimeMs < 2000)
        {
            this.playSong(this.songs.songBefore(this.currentSong));
        }
        else
        {
            this.player.seekMs(0);
        }
    }

    private playPause() : void
    {
        this.bottomBar.playPause();
    }

    private processAppCommand(e : any, command : string) : void
    {
        switch (command)
        {
            case "media-nexttrack": this.playNext(); break;
            case "media-previoustrack": this.playPrevious(); break;
            case "media-play-pause": this.playPause(); break;
        }
    }
}