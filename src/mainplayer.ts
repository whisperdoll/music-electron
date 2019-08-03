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
import { PlaylistWidget } from "./playlistwidget";
import { PlaylistItemWidget } from "./playlistitemwidget";
import { Sidebar } from "./sidebar";
import { PlaylistData } from "./playlistdata";
import { StatusBar } from "./statusbar";
import { PlaylistDialog } from "./playlistdialog";

export class MainPlayer extends Widget
{
    private filter : Filter;
    private playlistWidget : PlaylistWidget;
    private player : Player;
    private bottomBar : BottomBar;
    private statusBar : StatusBar;
    private sidebar : Sidebar;
    private songMenu : ContextMenu;
    private playlistMenu : ContextMenu;
    private renameDialog : RenameDialog;
    private spectrum : Spectrum;

    private currentlyPlaying : PlaylistItemWidget;
    private songCountSwitch : boolean = false;

    private backgroundOverlay : HTMLElement;
    private backgroundPicture : HTMLElement;
    private loadingElement : HTMLImageElement;

    private skipOnceSongs : PlaylistItemWidget[] = [];

    constructor(container : HTMLElement)
    {
        super(container);

        this.bottomBar = new BottomBar(createElement("div", "bottomPanel"));
        this.statusBar = new StatusBar(this.playlistWidget);
        this.filter = new Filter(createElement("div", "filter-container"));
        this.player = new Player(this.bottomBar.wavebar);
        this.spectrum = new Spectrum();
        this.sidebar = new Sidebar(createElement("div", "sidebar"), this.container);
        this.playlistWidget = new PlaylistWidget(this.sidebar.savePlaylist.bind(this.sidebar), createElement("div", "songList"));


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

        let playlistLoadedCondition = () => this.playlistWidget.playlist.loaded;
        let itemSelectedCondition = () => this.playlistWidget.currentSelection.length > 0;
        let songSelectedCondition = () => itemSelectedCondition() && this.playlistWidget.currentSelectionItems.every(item => item instanceof Song);
        let songIsPartOfPathCondition = () => this.playlistWidget.currentSelectionItems.every(item => !!this.playlistWidget.playlist.songParentPath(<Song>item));
        let songIsAloneCondition = () => this.playlistWidget.currentSelectionItems.every(item => !this.playlistWidget.playlist.songParentPath(<Song>item));

        this.songMenu = new ContextMenu();
        this.songMenu.addItem(new ContextMenuItem("Rename...", this.promptRename.bind(this), songSelectedCondition));
        //this.songMenu.addItem(new ContextMenuItem("Edit rules...", this.editRules.bind(this)));
        this.songMenu.addItem(new ContextMenuItem("Reveal in explorer", this.revealInExplorer.bind(this), songSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Skip once", this.skipSongOnce.bind(this), itemSelectedCondition));
        this.songMenu.addItem(new ContextMenuItem("Remove Song", this.removeSelectedSongs.bind(this), songIsAloneCondition));

        this.playlistMenu = new ContextMenu();
        let playListItem = new ContextMenuItem("Add to playlist", undefined, itemSelectedCondition);
        playListItem.subMenu = this.playlistMenu;
        this.songMenu.addItem(playListItem);
        this.sidebar.on("playlistschange", (playlists : PlaylistData[]) =>
        {
            this.playlistMenu.clear();

            playlists.forEach(playlist =>
            {
                    let menuItem = new ContextMenuItem(
                        playlist.name,
                        () =>
                        {
                            playlist.paths.push(...this.playlistWidget.currentSelection.map(itemWidget => itemWidget.item.getFilename()));
                            this.sidebar.savePlaylist(playlist);
                        },
                        () =>
                        {
                            return playlist !== this.playlistWidget.playlistData
                        }
                    );

                    this.playlistMenu.addItem(menuItem);
            });
        });
        
        this.songMenu.addItem(new ContextMenuItem("Remove from playlist", this.removeFromPlaylist.bind(this), itemSelectedCondition));

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
            this.playlistWidget,
            this.bottomBar,
            this.statusBar,
            this.sidebar,
            this.songMenu,
            this.playlistMenu,
            this.spectrum,
            this.loadingElement,
            this.renameDialog
        );

        this.playlistWidget.container.setAttribute("tabIndex", "0");

        let ipcRenderer = require("electron").ipcRenderer;
        ipcRenderer.on("app-command", this.processAppCommand.bind(this));

        (window as any).mainPlayer = this;
        (window as any).RenameRule = RenameRule;

        this.init();
    }

    private init() : void
    {
        //console.time("all loaded");

        /*this.playlistWidget.loadFromPath("D:\\Google Drive\\Music", () =>
        {
            //console.timeEnd("all loaded");
        
            this.loadingElement.style.display = "none";
        });*/

        this.playlistWidget.on("loadstart", () =>
        {
            showElement(this.loadingElement);
        });

        this.playlistWidget.on("reset", () =>
        {
            this.stopSong();
        });

        this.playlistWidget.on("construct", () =>
        {
            hideElement(this.loadingElement);
            this.stopSong();
        });

        this.playlistWidget.on("dblclickitem", (item : PlaylistItemWidget, e : MouseEvent) =>
        {
            this.playItem(item, true);
        });

        this.playlistWidget.on("rightclick", (e : MouseEvent) =>
        {
            this.songMenu.show(e.clientX + 1, e.clientY + 1);
        });

        this.playlistWidget.container.addEventListener("keypress", e =>
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

        this.playlistWidget.container.addEventListener("keydown", e =>
        {
            if (this.playlistWidget.currentSelection.length === 0)
            {
                return;
            }

            if (e.which === 38) // up
            {
                e.preventDefault();
                this.playlistWidget.shiftSelection(-1);
                element_scrollIntoViewIfNeeded(this.playlistWidget.currentSelection[0].container, "top", false);
            }
            else if (e.which === 40) // down
            {
                e.preventDefault();
                this.playlistWidget.shiftSelection(1);
                element_scrollIntoViewIfNeeded(array_last(this.playlistWidget.currentSelection).container, "bottom", false);
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
            this.currentlyPlaying.item.metadata.plays++;
            Playlist.writeCache();
        });

        this.filter.onpreview = (filter) =>
        {
            // console.log("preview: " + filter);
            this.playlistWidget.playlist.previewFilter(filter, true);
        };

        this.filter.onfilter = (filter) =>
        {
            //console.log("filter: " + filter);
            this.playlistWidget.playlist.filter(filter);
        };

        this.bottomBar.hookPlayer(this.player);

        this.bottomBar.onplaypressed = () =>
        {
            if (!this.currentlyPlaying)
            {
                return this.playSelected();
            }

            let success = this.playItem(this.currentlyPlaying);
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
            this.playlistWidget.playlist.shuffle();
        });

        this.bottomBar.on("shuffleoff", () =>
        {
            this.playlistWidget.playlist.unshuffle();
        });

        this.sidebar.on("playlistselect", (playlistData : PlaylistData) =>
        {
            this.playlistWidget.loadPlaylist(playlistData);
        });
    }

    /*private showPlaylists() : void
    {
        this.playlists.show();
        this.playlistWidget.container.style.width = "calc(100% - " + this.playlists.container.getBoundingClientRect().width + "px)";
    }

    private hidePlaylists() : void
    {
        this.playlists.hide();
        this.playlistWidget.container.style.width = "100%";
    }*/

    private removeSelectedSongs() : void
    {
        this.playlistWidget.removeSelected();
    }

    private promptRename() : void
    {
        // console.log("hey- o!!!");
        if (this.playlistWidget.currentSelection.length > 0)
        {
            // console.log("hHELP!!");
            this.renameDialog.show(this.playlistWidget.currentSelectionItems.filter(item => item instanceof Song).map(item => <Song>item));
        }
    }

    private editRules() : void
    {
        alert("coming soon,,,");
    }

    private revealInExplorer() : void
    {
        if (this.playlistWidget.currentSelection.length > 0)
        {
            revealInExplorer(this.playlistWidget.currentSelection[0].item.getFilename());
        }
    }

    private skipSongOnce() : void
    {
        this.skipOnceSongs.push(...this.playlistWidget.currentSelection);
        this.playlistWidget.currentSelection.forEach(song =>
        {
            song.container.classList.add("skipping");
        });
    }

    private removeFromPlaylist() : void
    {
        //this.playlistWidget.playlist.removeSongsFromPlaylist(...this.playlistWidget.currentSelectionSongs);   
    }

    private scrollToCurrent() : void
    {
        if (this.currentlyPlaying)
        {
            this.currentlyPlaying.container.scrollIntoView({
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
        if (this.playlistWidget.currentSelection.length === 0)
        {
            return this.playItem(this.playlistWidget.renderedSongs[0]);
        }
        else if (this.playlistWidget.currentSelection.length === 1)
        {
            return this.playItem(this.playlistWidget.currentSelection[0]);
        }
        else if (this.playlistWidget.currentSelection.length > 1)
        {
            let ids = this.playlistWidget.currentSelection.map(itemWidget => "id:" + itemWidget.item.id);
            let filterString = ids.join("|");
            this.filter.removeAllFilters();
            this.filter.addFilter(filterString);
            return this.playItem(this.playlistWidget.firstItem);
        }
    }

    private playItem(itemWidget : PlaylistItemWidget, restart : boolean = false) : boolean
    {
        if (!itemWidget)
        {
            return false;
        }

        if (array_remove_all(this.skipOnceSongs, itemWidget).existed)
        {
            itemWidget.container.classList.remove("skipping");
            return this.playItem(this.playlistWidget.itemAfter(itemWidget));
        }

        let success = this.player.play(itemWidget.item.getFilename(), restart);

        if (success)
        {
            if (this.currentlyPlaying)
            {
                if (this.currentlyPlaying === itemWidget)
                {
                    return true;
                }

                this.currentlyPlaying.container.classList.remove("playing");
            }

            this.currentlyPlaying = itemWidget;
            this.currentlyPlaying.container.classList.add("playing");

            this.bottomBar.primaryString = itemWidget.item.metadata.title;
            this.bottomBar.secondaryString = itemWidget.item.metadata.artist + " — " + itemWidget.item.metadata.album;

            // scroll

            this.backgroundSrc = "url(" + JSON.stringify(itemWidget.item.metadata.picture) + ")";
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
            this.currentlyPlaying.container.classList.remove("playing");
            this.currentlyPlaying = null;
        }
        this.skipOnceSongs.forEach(widget =>
        {
            widget.container.classList.remove("skipping");
        });
        this.skipOnceSongs = [];
    }

    private playNext() : boolean
    {
        return this.playItem(this.playlistWidget.itemAfter(this.currentlyPlaying));
    }

    private playPrevious() : void
    {
        if (this.player.currentTimeMs < 2000)
        {
            this.playItem(this.playlistWidget.itemBefore(this.currentlyPlaying));
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