import { Widget } from "./widget";
import { Playlist } from "./playlist";
import { Player } from "./player";
import { BottomBar } from "./bottombar";
import { Filter } from "./filter";
import { createElement, array_copy, array_contains, hideElement, showElement, array_last, element_scrollIntoViewIfNeeded, array_remove_all, revealInExplorer } from "./util";
import { Song } from "./song";
import { RenameRule } from "./renamerule";
import { ContextMenu, ContextMenuItem } from "./contextmenu";
import { RenameDialog } from "./renamedialog";
import { Spectrum } from "./spectrum";
import { InputDialog } from "./inputdialog";
import { PlaylistView } from "./playlistview";
import { Sidebar } from "./sidebar";
import { PlaylistData } from "./playlistdata";
import { StatusBar } from "./statusbar";
import { PlaylistDialog } from "./playlistdialog";
import { SongView } from "./songview";
import { FileCache } from "./filecache";
import * as fs from "fs";

export class MainPlayer extends Widget
{
    private filter : Filter;
    private playlist : Playlist;
    private playlistView : PlaylistView;
    private player : Player;
    private bottomBar : BottomBar;
    private statusBar : StatusBar;
    private sidebar : Sidebar;
    private songMenu : ContextMenu;
    private playlistMenu : ContextMenu;
    private renameDialog : RenameDialog;
    private spectrum : Spectrum;

    private currentlyPlaying : Song;
    private songCountSwitch : boolean = false;

    private backgroundOverlay : HTMLElement;
    private backgroundPicture : HTMLElement;
    private loadingElement : HTMLImageElement;

    private skipOnceSongs : Song[] = [];

    constructor(container : HTMLElement)
    {
        super(container);

        FileCache.loadMetadata();

        this.bottomBar = new BottomBar(createElement("div", "bottomPanel"));
        this.filter = new Filter(createElement("div", "filter-container"));
        this.player = new Player(this.bottomBar.wavebar);
        this.spectrum = new Spectrum();
        this.sidebar = new Sidebar(createElement("div", "sidebar"), this.container);
        this.playlist = new Playlist(this.sidebar.savePlaylist.bind(this.sidebar));

        this.playlistView = new PlaylistView(this.playlist);
        this.statusBar = new StatusBar(this.playlistView);

        this.renameDialog = new RenameDialog(((err : NodeJS.ErrnoException) =>
        {
            if (err)
            {
                window.alert(err);
                throw err;
            }

            this.renameDialog.hide();
        }).bind(this));

        // construct main context menu //

        let playlistLoadedCondition = () => this.playlist.loaded;
        let songSelectedCondition = () => this.playlist.currentSelection.length > 0;
        let songIsPartOfPathCondition = () => this.playlist.currentSelection.every(song => !!this.playlist.songParentPath(song));
        let songIsAloneCondition = () => this.playlist.currentSelection.every(song => !this.playlist.songParentPath(song));
        let songsAreSameAlbumCondition = () => this.playlist.currentSelection.length > 0 && this.playlist.currentSelection.every(song => song.metadata.album === this.playlist.currentSelection[0].metadata.album);

        this.songMenu = new ContextMenu();
        this.songMenu.addItem(new ContextMenuItem("Rename...", this.promptRename.bind(this), songSelectedCondition));
        //this.songMenu.addItem(new ContextMenuItem("Edit rules...", this.editRules.bind(this)));
        this.songMenu.addItem(new ContextMenuItem("Reveal in explorer", this.revealInExplorer.bind(this), songSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Make Most Recent", this.makeMostRecent.bind(this), songSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Consolidate Modified Times", this.consolidateModifiedTimes.bind(this), songsAreSameAlbumCondition));
        this.songMenu.addItem(new ContextMenuItem("Refresh Metadata", this.refreshMetadata.bind(this), songSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Skip once", this.skipSongOnce.bind(this), songSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Remove", this.removeSelectedSongs.bind(this), songSelectedCondition));

        this.playlistMenu = new ContextMenu();
        let playListItem = new ContextMenuItem("Add to playlist", undefined, songSelectedCondition);
        playListItem.subMenu = this.playlistMenu;
        this.songMenu.addItem(playListItem);
        this.sidebar.on("playlistschange", (playlistDatas : PlaylistData[]) =>
        {
            this.playlistMenu.clear();

            playlistDatas.forEach(playlistData =>
            {
                    let menuItem = new ContextMenuItem(
                        playlistData.name,
                        () =>
                        {
                            playlistData.paths.push(...this.playlist.currentSelection.map(song => { return { path: song.filename }; }));
                            this.sidebar.savePlaylist(playlistData);
                        },
                        () =>
                        {
                            return playlistData !== this.playlist.playlistData
                        }
                    );

                    this.playlistMenu.addItem(menuItem);
            });
        });

        // init ui //

        this.backgroundPicture = createElement("div", "albumArt");
        this.backgroundOverlay = createElement("div", "albumOverlay");

        this.loadingElement = <HTMLImageElement>createElement("img", "loading");
        this.loadingElement.src = "./img/loading.gif";
        hideElement(this.loadingElement);

        this.appendChild(
            this.backgroundPicture,
            this.backgroundOverlay,
            this.filter,
            this.playlistView,
            this.bottomBar,
            this.statusBar,
            this.sidebar,
            this.songMenu,
            this.playlistMenu,
            this.spectrum,
            this.loadingElement,
            this.renameDialog
        );

        this.playlistView.container.setAttribute("tabIndex", "0");

        let ipcRenderer = require("electron").ipcRenderer;
        ipcRenderer.on("app-command", this.processAppCommand.bind(this));

        (window as any).mainPlayer = this;
        (window as any).RenameRule = RenameRule;

        this.init();
    }

    private init() : void
    {
        //console.time("all loaded");

        /*this.playlist.loadFromPath("D:\\Google Drive\\Music", () =>
        {
            //console.timeEnd("all loaded");
        
            this.loadingElement.style.display = "none";
        });*/

        this.playlist.on("loadstart", () =>
        {
            showElement(this.loadingElement);
        });

        this.playlist.on("reset", () =>
        {
            this.stopSong();
        });

        this.playlist.on("load", () =>
        {
            hideElement(this.loadingElement);
            this.stopSong();
        });

        this.playlistView.on("dblclicksong", (songView : SongView, e : MouseEvent) =>
        {
            this.playSong(songView.song, true);
        });

        this.playlistView.on("rightclick", (e : MouseEvent) =>
        {
            this.songMenu.show(e.clientX + 1, e.clientY + 1);
        });

        this.playlistView.container.addEventListener("keypress", e =>
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
            this.currentlyPlaying.metadata.plays++;
            FileCache.writeCache();
        });

        this.filter.on("update", () =>
        {
            // console.log("preview: " + filter);
            this.playlist.filter(this.filter.filterInfo, true);
        });

        this.bottomBar.hookPlayer(this.player);

        this.bottomBar.onplaypressed = () =>
        {
            if (!this.currentlyPlaying)
            {
                return this.playSelected();
            }

            let success = this.playSong(this.currentlyPlaying);
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
            this.playlist.shuffle();
        });

        this.bottomBar.on("shuffleoff", () =>
        {
            this.playlist.unshuffle();
        });

        this.sidebar.on("playlistselect", (playlistData : PlaylistData) =>
        {
            this.playlist.loadPlaylist(playlistData);
        });
    }

    /*private showPlaylists() : void
    {
        this.playlists.show();
        this.playlist.container.style.width = "calc(100% - " + this.playlists.container.getBoundingClientRect().width + "px)";
    }

    private hidePlaylists() : void
    {
        this.playlists.hide();
        this.playlist.container.style.width = "100%";
    }*/

    private makeMostRecent() : void
    {
        let newMTime : Date = new Date();

        this.playlist.currentSelection.forEach((song) =>
        {
            fs.utimesSync(song.filename, song.stats.atime, newMTime);
        });

        this.playlist.reload();
    }

    private refreshMetadata() : void
    {
        this.playlist.currentSelection.forEach((song) =>
        {
            song.refreshMetadata();
        });
    }

    private consolidateModifiedTimes() : void
    {
        let newMTime = this.playlist.currentSelection[0].stats.mtime;

        this.playlist.currentSelection.forEach((song) =>
        {
            fs.utimesSync(song.filename, song.stats.atime, newMTime);
        });

        // scrolltop doesnt get reset on reload so commenting this out
        /*let scrollTop = this.playlistView.container.scrollTop;
        this.playlistView.once("construct", () =>
        {
            this.playlistView.container.scrollTop = scrollTop;
        });*/
        this.playlist.reload();
    }

    private removeSelectedSongs() : void
    {
        this.playlist.removeSelected();
    }

    private promptRename() : void
    {
        // console.log("hey- o!!!");
        if (this.playlist.currentSelection.length > 0)
        {
            // console.log("hHELP!!");
            this.renameDialog.show(this.playlist.currentSelection);
        }
    }

    private editRules() : void
    {
        alert("coming soon,,,");
    }

    private revealInExplorer() : void
    {
        if (this.playlist.currentSelection.length > 0)
        {
            revealInExplorer(this.playlist.currentSelection[0].filename);
        }
    }

    private skipSongOnce() : void
    {
        this.playlist.currentSelection.forEach(song =>
        {
            song.skipping = true;
        });
    }

    private scrollToCurrent() : void
    {
        if (this.currentlyPlaying)
        {
            this.playlistView.scrollIntoView(this.currentlyPlaying);
        }
    }

    private set backgroundSrc(src : string)
    {
        (this.backgroundPicture.style as any)["background-image"] = src;
    }

    private playSelected() : boolean
    {
        if (this.playlist.currentSelection.length === 0)
        {
            return this.playSong(this.playlist.visibleSongs[0]);
        }
        else if (this.playlist.currentSelection.length === 1)
        {
            return this.playSong(this.playlist.currentSelection[0]);
        }
        else if (this.playlist.currentSelection.length > 1)
        {
            let ids = this.playlist.currentSelection.map(song => "id:" + song.id);
            let filterString = ids.join("|");
            //this.filter.removeAllFilters(true);
            this.filter.addFilter(filterString);
            return this.playSong(this.playlist.visibleSongs[0]);
        }
    }

    private playSong(song : Song, restart : boolean = false) : boolean
    {
        if (!song)
        {
            return false;
        }

        if (song.skipping)
        {
            song.skipping = false;
            return this.playSong(this.playlist.songAfter(song));
        }

        let success = this.player.play(song.filename, restart);

        if (success)
        {
            if (this.currentlyPlaying)
            {
                if (this.currentlyPlaying === song)
                {
                    return true;
                }
                
                this.currentlyPlaying.playing = false;
            }

            this.currentlyPlaying = song;
            this.currentlyPlaying.playing = true;

            this.bottomBar.primaryString = song.metadata.title;
            this.bottomBar.secondaryString = song.metadata.artist + " — " + song.metadata.album;

            // scroll

            this.backgroundSrc = "url(" + JSON.stringify(song.metadata.picture) + ")";
        }

        return success;
    }

    private stopSong() : void
    {
        this.player.stop();
        this.backgroundSrc = "";
        this.bottomBar.reset();
        if (this.currentlyPlaying)
        {
            this.currentlyPlaying = null;
        }
    }

    private playNext() : boolean
    {
        return this.playSong(this.playlist.songAfter(this.currentlyPlaying));
    }

    private playPrevious() : void
    {
        if (this.player.currentTimeMs < 2000)
        {
            this.playSong(this.playlist.songBefore(this.currentlyPlaying));
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