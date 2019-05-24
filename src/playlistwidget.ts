import { Widget } from "./widget";
import { PlaylistItemWidget } from "./playlistitemwidget";
import { Dialog } from "./dialog";
const edialog = require("electron").remote.dialog;
import * as fs from "fs";
import * as npath from "path";
import { Playlist } from "./playlist";
import * as archiver from "archiver";
import { array_remove, array_last, revealInExplorer, isFileNotFoundError, array_contains, array_item_at, array_insert, SortFunction } from "./util";
import { PlaylistItem } from "./playlistitem";

export class PlaylistWidget extends Widget
{
    public playlist : Playlist;
    private playlistItemWidgets : Map<PlaylistItem, PlaylistItemWidget> = new Map<PlaylistItem, PlaylistItemWidget>();
    public currentSelection : PlaylistItemWidget[] = [];
    private _renderedItems : PlaylistItemWidget[] = [];
    private constructed : boolean = false;

    private dragging : boolean = false;
    private dragOrigin : { x : number, y : number };

    private zipOverlay : Dialog;

    constructor(container? : HTMLElement)
    {
        super(container || "songList");

        this.createEvent("loadstart");
        this.createEvent("construct");
        this.createEvent("click");
        this.createEvent("dblclick");
        this.createEvent("rightclick");

        this.playlist = new Playlist();
        this.playlist.on("load", this.construct.bind(this));
        this.playlist.on("change", this.render.bind(this));
        this.playlist.on("loadstart", () => this.emitEvent("loadstart"));

        this.container.addEventListener("mousemove", this.mousemoveFn.bind(this));
        this.container.addEventListener("mouseup", this.mouseupFn.bind(this));

        this.zipOverlay = new Dialog(false);
        this.zipOverlay.appendHTML("Please wait,,,");
        document.body.appendChild(this.zipOverlay.container);
    }

    public itemAfter(playlistItemWidget : PlaylistItemWidget) : PlaylistItemWidget
    {
        return this.playlistItemWidgets.get(this.playlist.itemAfter(playlistItemWidget.item));
    }

    public itemBefore(playlistItemWidget : PlaylistItemWidget) : PlaylistItemWidget
    {
        return this.playlistItemWidgets.get(this.playlist.itemBefore(playlistItemWidget.item));
    }

    public get firstItem() : PlaylistItemWidget
    {
        return this.playlistItemWidgets.get(this.playlist.filteredItems[0]);
    }

    public get currentSelectionItems() : PlaylistItem[]
    {
        return this.currentSelection.map(itemWidget => itemWidget.item);
    }

    private constructItemWidget(item : PlaylistItem) : PlaylistItemWidget
    {
        let itemWidget = new PlaylistItemWidget(item);
        itemWidget.on("click", (itemWidget : PlaylistItemWidget, e : MouseEvent) => this.itemClickFn(itemWidget, e));
        itemWidget.on("mousedown", (itemWidget : PlaylistItemWidget, e : MouseEvent) => this.itemMousedownFn(itemWidget, e));
        itemWidget.on("dblclick", (itemWidget : PlaylistItemWidget, e : MouseEvent) => this.emitEvent("dblclick", itemWidget, e));
        itemWidget.on("rightclick", (itemWidget : PlaylistItemWidget, e : MouseEvent) => this.emitEvent("rightclick", itemWidget, e));
        return itemWidget;
    }

    private construct()
    {
        this.playlistItemWidgets.clear();

        let frag = document.createDocumentFragment();

        this.playlist.items.forEach(item =>
        {
            let itemWidget = this.constructItemWidget(item);
            this.playlistItemWidgets.set(item, itemWidget);
            frag.appendChild(itemWidget.container);
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

        this._renderedItems = this.playlist.getRenderList().map(item => this.playlistItemWidgets.get(item));
        console.log("rendering: " + this._renderedItems.length + " items");

        this.container.innerHTML = "";
        
        this._renderedItems.forEach((itemWidget, i) =>
        {
            if ((i & 1) === 0)
            {
                itemWidget.container.classList.add("even");
            }
            else
            {
                itemWidget.container.classList.remove("even");
            }
        });

        this.appendChild(...this._renderedItems);
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

        let filenames = this.playlist.filenames;
        
        filenames.forEach((filename, i) =>
        {
            let pad = Math.max(2, filenames.length.toString().length);

            archive.file(filename, { name: i.toString().padStart(pad, "0") + " - " + npath.basename(filename) });
        });

        archive.finalize();
    }

    public get sortFn() : SortFunction<PlaylistItemWidget>
    {
        return (left : PlaylistItemWidget, right : PlaylistItemWidget) =>
        {
            return this.playlist.sortFn(left.item, right.item);
        };
    }

    public select(itemWidget : PlaylistItemWidget, removeOthers : boolean = false) : void
    {
        if (this.currentSelection.length > 0)
        {
            if (removeOthers)
            {
                this.deselectAll();
                this.select(itemWidget);
                return;
            }
            else if (this.currentSelection.indexOf(itemWidget) === -1)
            {
                array_insert(this.currentSelection, itemWidget, this.sortFn);
                this.doSelectThings(itemWidget);
            }
        }
        else
        {
            this.currentSelection = [ itemWidget ];
            this.doSelectThings(itemWidget);
        }
    }

    public shiftSelection(amount : number)
    {
        let newIndexes = [];

        while (this.currentSelection.length > 0)
        {
            let itemWidget = this.currentSelection[0];
            this.deselect(itemWidget, true);
            newIndexes.push(this.renderedSongs.indexOf(itemWidget) + amount);
        }

        newIndexes.forEach(newIndex =>
        {
            this.select(array_item_at(this.renderedSongs, newIndex), false);
        });
    }

    public selectRange(item1 : PlaylistItemWidget, item2: PlaylistItemWidget, removeOthers : boolean = false) : void
    {
        if (removeOthers)
        {
            this.deselectAll();
        }

        let sort = this.playlist.sortFn(item1.item, item2.item);
        let firstSong : PlaylistItemWidget, lastSong : PlaylistItemWidget;

        if (sort)
        {
            firstSong = item1;
            lastSong = item2;
        }
        else
        {
            firstSong = item2;
            lastSong = item1;
        }

        let firstIndex = this.renderedSongs.indexOf(firstSong);
        let lastIndex = this.renderedSongs.indexOf(lastSong);

        let toAdd = this.renderedSongs.slice(firstIndex, lastIndex + 1);
        toAdd = toAdd.filter(item => this.currentSelection.indexOf(item) === -1);
        toAdd.forEach(item =>
        {
            this.doSelectThings(item);
        });

        this.currentSelection.push(...toAdd);
    }

    // called by selection functions //
    private doSelectThings(itemWidget : PlaylistItemWidget)
    {
        itemWidget.container.classList.add("selected");
    }

    public selectTo(itemWidget : PlaylistItemWidget) : void
    {
        if (this.currentSelection.length === 0)
        {
            this.select(itemWidget);
        }
        else if (this.currentSelection.length === 1)
        {
            this.selectRange(itemWidget, this.currentSelection[0]);
        }
        else
        {
            let firstIndex = this.renderedSongs.indexOf(this.currentSelection[0]);
            let lastIndex = this.renderedSongs.indexOf(this.currentSelection[this.currentSelection.length - 1]);
            let itemWidgetIndex = this.renderedSongs.indexOf(itemWidget);
            
            if (itemWidgetIndex >= firstIndex && itemWidgetIndex <= lastIndex)
            {
                return;
            }
            else if (itemWidgetIndex < firstIndex)
            {
                this.selectRange(itemWidget, this.renderedSongs[lastIndex]);
            }
            else
            {
                this.selectRange(itemWidget, this.renderedSongs[firstIndex]);
            }
        }
    }

    public selectAll() : void
    {
        this.selectRange(this.renderedSongs[0], array_last(this.renderedSongs));
    }

    public deselect(itemWidget : PlaylistItemWidget, remove : boolean = true) : void
    {
        itemWidget.container.classList.remove("selected");
        if (remove)
        {
            array_remove(this.currentSelection, itemWidget);
        }
    }

    public deselectAll() : void
    {
        this.currentSelection.forEach(itemWidget =>
        {
            itemWidget.container.classList.remove("selected");
        });

        this.currentSelection = [];
    }

    public get renderedSongs() : PlaylistItemWidget[]
    {
        return this._renderedItems;
    }

    // only to be called by item container's onclick //
    private itemClickFn(item : PlaylistItemWidget, e : MouseEvent) : void
    {
        e.stopPropagation();

        if (e.shiftKey)
        {
            if (e.ctrlKey && this.currentSelection.length > 0)
            {
                let sorted = this.renderedSongs;

                let getDist = (item1 : PlaylistItemWidget, item2 : PlaylistItemWidget) =>
                {
                    return Math.abs(sorted.indexOf(item1) - sorted.indexOf(item2));
                }

                let closest : PlaylistItemWidget = this.currentSelection[0];
                let closestDist = getDist(item, closest);
                
                this.currentSelection.forEach(sSong =>
                {
                    let dist = getDist(sSong, item);
                    if (dist < closestDist)
                    {
                        closest = sSong;
                        closestDist = dist;
                    }
                });

                this.selectRange(item, closest, false);
            }
            else
            {
                this.selectTo(item);
            }
        }
        else if (e.ctrlKey)
        {
            if (array_contains(this.currentSelection, item))
            {
                this.deselect(item, true);
            }
            else
            {
                this.select(item, false);
            }
        }
        else
        {
            this.select(item, true);
        }

        this.emitEvent("click", item, e);
    }

    private itemMousedownFn(itemWidget : PlaylistItemWidget, e : MouseEvent) : void
    {
        if (array_contains(this.currentSelection, itemWidget))
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
            let h = this.playlistItemWidgets.get(this.playlist.items[0]).container.getBoundingClientRect().height;

            if (dy >= h)
            {
                if (array_last(this.currentSelection).container.nextElementSibling)
                {
                    this.currentSelection.forEach(itemWidget =>
                    {
                        this.playlist.moveItem(itemWidget.item, ~~(dy / h));
                    });

                    dy %= h;
                    this.dragOrigin.y = e.clientY - dy;
                }
            }
            else if (dy <= -h)
            {
                if (this.currentSelection[0].container.previousElementSibling)
                {
                    this.currentSelection.forEach(itemWidget =>
                    {
                        this.playlist.moveItem(itemWidget.item, Math.ceil(dy / h));
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