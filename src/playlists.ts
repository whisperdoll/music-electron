import { Widget } from "./widget";
import * as npath from "path";
import { getUserDataPath, createElement, fileExists, array_remove, mergeSorted, array_contains, isFileNotFoundError } from "./util";
import { Playlist, Songs } from "./songs";
const dir = require("node-dir");
import * as fs from "fs";
import { SafeWriter } from "./safewriter";
import { ContextMenu, ContextMenuItem } from "./contextmenu";
//import mainWindow from "./main";

export class Playlists extends Widget
{
    private static savePath = npath.join(getUserDataPath(), "playlists/");

    private playlists : Playlist[] = [];

    private listElement : HTMLUListElement;
    private addButton : HTMLElement;
    private contextMenu : ContextMenu;
    private rightClickedPlaylist : Playlist;
    private listMap : Map<Playlist, HTMLElement> = new Map<Playlist, HTMLElement>();

    constructor(container? : HTMLElement)
    {
        super(container);

        this.createEvent("playlistselect");
        this.createEvent("load");
        this.createEvent("requestadd");
        this.createEvent("requestedit");
        this.createEvent("requestdelete");
        this.createEvent("addplaylist");
        this.createEvent("editplaylist");

        this.load(this.construct.bind(this));
    }

    public get defaultPlaylist() : Playlist
    {
        return this.playlists[0] || null;
    }

    public add(playlist : Playlist, edit : boolean = false)
    {
        if (edit && array_contains(this.playlists, playlist))
        {
            this.updateLabels(playlist);
            this.save(playlist);
            this.emitEvent("editplaylist", playlist);
        }
        else
        {
            this.playlists.forEach(myPlaylist =>
            {
                if (playlist.name.toLowerCase() === myPlaylist.name.toLowerCase())
                {
                    playlist.name += "_2";
                }
            });
    
            this.playlists.push(playlist);
            this.constructListItem(playlist);
            this.listElement.appendChild(this.addButton);
            this.save(playlist);
            this.emitEvent("addplaylist", playlist);
        }
    }

    public updateLabels(...playlists : Playlist[])
    {
        if (playlists.length === 0)
        {
            playlists = this.playlists;
        }

        playlists.forEach(playlist =>
        {
            this.listMap.get(playlist).innerText = playlist.name + (playlist.type === "songList" ? " (" + playlist.filenames.length + ")" : "");
        });
    }

    private remove(playlist : Playlist)
    {
        if (array_remove(this.playlists, playlist).existed)
        {
            this.listElement.removeChild(this.listMap.get(playlist));
            this.listMap.delete(playlist);
            if (playlist.filename)
            {
                fs.unlink(playlist.filename, err =>
                {
                    if (err/* && err.code !== "ENOENT"*/)
                    {
                        throw err;
                    }
                });
            }
        }
    }

    public save(...playlists : Playlist[]) : void
    {
        if (playlists.length === 0)
        {
            playlists = this.playlists;
        }
        
        playlists.forEach(playlist =>
        {
            let filename = npath.join(Playlists.savePath, playlist.name + ".playlist");

            if (playlist.filename && npath.normalize(filename) !== npath.normalize(playlist.filename))
            {
                if (fileExists(playlist.filename))
                {
                    fs.unlink(playlist.filename, (err) =>
                    {
                        if (err)
                        {
                            throw err;
                        }
                    });
                }
            }

            playlist.filename = filename;

            SafeWriter.write(
                playlist.filename,
                JSON.stringify(playlist)
            );
        });
    }

    private construct()
    {
        this.listElement = <HTMLUListElement>createElement("ul", "list");

        this.addButton = createElement("li", "listItem add");
        this.addButton.innerText = "+";
        this.addButton.addEventListener("click", () =>
        {
            this.emitEvent("requestadd");
        });

        this.contextMenu = new ContextMenu();
        
        let editItem = new ContextMenuItem("Edit...", () =>
        {
            this.emitEvent("requestedit", this.rightClickedPlaylist);
        });
        
        let deleteItem = new ContextMenuItem("Delete", () =>
        {
            this.remove(this.rightClickedPlaylist);
            this.emitEvent("requestdelete", this.rightClickedPlaylist);
        });

        this.contextMenu.addItem(editItem);
        this.contextMenu.addItem(deleteItem);

        let frag = document.createDocumentFragment();

        this.playlists.forEach(playlist =>
        {
            this.constructListItem(playlist, frag);
        });

        frag.appendChild(this.addButton);

        this.listElement.appendChild(frag);
        this.appendChild(this.listElement);
        document.body.appendChild(this.contextMenu.container);
    }

    private constructListItem(playlist : Playlist, container : Node = this.listElement)
    {
        let li = createElement("li", "listItem");
        li.addEventListener("dblclick", () =>
        {
            this.emitEvent("playlistselect", playlist);
        });
        li.addEventListener("contextmenu", (e : MouseEvent) =>
        {
            this.rightClickedPlaylist = playlist;
            console.log(e);
            this.contextMenu.show(e.clientX + 1, e.clientY + 1);
        });
        container.appendChild(li);
        
        this.listMap.set(playlist, li);
        this.updateLabels(playlist);
    }

    private load(callback? : Function) : void
    {
        if (!fileExists(Playlists.savePath))
        {
            fs.mkdirSync(Playlists.savePath);
        }

        dir.files(Playlists.savePath, (err : NodeJS.ErrnoException, filenames : string[]) =>
        {
            if (err)
            {
                throw err;
            }

            this.loadHelper(filenames, callback);
        });
    }

    private loadHelper(filenames : string[], callback? : Function)
    {
        if (filenames.length === 0)
        {
            callback && callback();
            return;
        }

        let statMap = new Map<string, fs.Stats>();
        filenames.forEach(filename =>
        {
            statMap.set(filename, fs.statSync(filename));
        });

        filenames = mergeSorted(filenames, (a, b) =>
        {
            return statMap.get(a).ctimeMs < statMap.get(b).ctimeMs;
        });

        let counter = 0;

        filenames.forEach(filename =>
        {
            try
            {
                let data = fs.readFileSync(filename, "utf8");
                let playlist : Playlist = JSON.parse(data);
                playlist.filename = filename;
                this.playlists.push(playlist);
                this.emitEvent("addplaylist", playlist);
                counter++;

                if (counter === filenames.length)
                {
                    callback && callback();
                    this.emitEvent("load");
                }
            }
            catch (err)
            {
                throw err;
            }
        });
    }
}