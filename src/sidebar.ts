import { Widget } from "./widget";
import { PlaylistData, PlaylistSavePath } from "./playlistdata";
import { createElement, array_last, fileExists, mergeSorted, array_remove } from "./util";
const dir = require("node-dir");
import * as fs from "fs";
import { SafeWriter } from "./safewriter";
import * as path from "path";
import { ContextMenu, ContextMenuItem } from "./contextmenu";

export class Sidebar extends Widget
{
    private playlists : PlaylistData[] = [];
    private playlistList : HTMLUListElement;
    private playlistMap : Map<PlaylistData, HTMLElement> = new Map<PlaylistData, HTMLElement>();
    private addPlaylistElement : HTMLElement;
    private contextMenu : ContextMenu;
    private contextPlaylist : PlaylistData;

    constructor(container : HTMLElement)
    {
        super(container);

        this.createEvent("load");
        this.createEvent("playlistselect");

        this.addPlaylistElement = createElement("li", "listItem add");
        this.addPlaylistElement.innerText = "+";
        this.addPlaylistElement.addEventListener("click", this.addPlaylist.bind(this));

        this.playlistList = <HTMLUListElement>createElement("ul", "list");

        this.contextMenu = new ContextMenu();
        this.contextMenu.addItem(new ContextMenuItem("Edit", this.editContextPlaylist.bind(this)));
        this.contextMenu.addItem(new ContextMenuItem("Delete", this.deleteContextPlaylist.bind(this)));

        this.appendChild(this.playlistList, this.contextMenu);

        this.load();
    }

    private renamePlaylist(playlist : PlaylistData, name : string) : void
    {
        let oldPath = this.filenameForPlaylist(playlist);
        playlist.name = name;
        fs.renameSync(oldPath, this.filenameForPlaylist(playlist));
        this.savePlaylist(playlist);
        this.construct();
    }

    private editContextPlaylist() : void
    {
        
    }

    private deleteContextPlaylist() : void
    {
        if (!this.contextPlaylist)
        {
            return;
        }

        fs.unlinkSync(this.filenameForPlaylist(this.contextPlaylist));
        array_remove(this.playlists, this.contextPlaylist);
        this.construct();
    }

    private construct() : void
    {
        this.playlistList.innerHTML = "";

        this.playlists.forEach(playlistData =>
        {
            this.constructPlaylistElement(playlistData);
        });

        this.playlistList.appendChild(this.addPlaylistElement);
    }

    private constructPlaylistElement(playlistData : PlaylistData)
    {
        let element = createElement("li", "listItem");
        element.innerText = playlistData.name;
        element.addEventListener("dblclick", () => this.emitEvent("playlistselect", playlistData));
        element.addEventListener("contextmenu", (e) =>
        {
            this.contextPlaylist = playlistData;
            this.contextMenu.show(e.layerX, e.layerY);
        });
        element.addEventListener("keydown", (e) =>
        {
            if (element.contentEditable === "true" && e.which === 13)
            {
                // enter //
                this.renamePlaylist(playlistData, element.innerText);
            }
            else if (element.contentEditable === "true" && e.which === 27)
            {
                // escape //
                element.innerText = playlistData.name;
                element.contentEditable = "false";
                element.classList.remove("editing");
            }
        });
        this.playlistList.appendChild(element);
        this.playlistMap.set(playlistData, element);
    }

    private filenameForPlaylist(playlist : PlaylistData) : string
    {
        return path.join(PlaylistSavePath, playlist.name + ".playlist");
    }

    private addPlaylist() : void
    {
        let num = 1;

        while (this.playlists.some(playlist => playlist.name === "Playlist " + num.toString()))
        {
            num++;
        }

        let newPlaylist =
        {
            name: "Playlist " + num.toString(),
            paths: <string[]>[],
            created: Date.now()
        };

        this.playlists.push(newPlaylist);

        this.constructPlaylistElement(newPlaylist);
        this.playlistList.appendChild(this.addPlaylistElement);

        this.savePlaylist(newPlaylist);
    }

    private savePlaylist(playlist : PlaylistData) : void
    {
        SafeWriter.writeSync(this.filenameForPlaylist(playlist), JSON.stringify(playlist));
    }

    private load()
    {
        if (!fileExists(PlaylistSavePath))
        {
            fs.mkdirSync(PlaylistSavePath);
        }

        dir.files(PlaylistSavePath, (err : NodeJS.ErrnoException, filenames : string[]) =>
        {
            if (err)
            {
                throw err;
            }
            
            filenames.forEach(filename =>
            {
                try
                {
                    let data = fs.readFileSync(filename, "utf8");
                    let playlistData = <PlaylistData>JSON.parse(data);
                    this.playlists.push(playlistData);
                }
                catch (err)
                {
                    throw err;
                }
            });

            this.playlists = mergeSorted(this.playlists, (a, b) => a.created < b.created);

            this.construct();
            this.emitEvent("load");
        });
    }
}