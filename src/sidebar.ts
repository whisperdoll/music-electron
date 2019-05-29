import { Widget } from "./widget";
import { PlaylistData, PlaylistSavePath, PlaylistDataItem } from "./playlistdata";
import { createElement, array_last, fileExists, mergeSorted } from "./util";
const dir = require("node-dir");
import * as fs from "fs";
import { SafeWriter } from "./safewriter";
import * as path from "path";

export class Sidebar extends Widget
{
    private playlists : PlaylistData[] = [];
    private playlistList : HTMLUListElement;
    private addPlaylistElement : HTMLElement;

    constructor(container : HTMLElement)
    {
        super(container);

        this.createEvent("load");
        this.createEvent("playlistselect");

        this.addPlaylistElement = createElement("li", "listItem add");
        this.addPlaylistElement.innerText = "+";
        this.addPlaylistElement.addEventListener("click", this.addPlaylist.bind(this));

        this.playlistList = <HTMLUListElement>createElement("ul", "list");
        this.appendChild(this.playlistList);

        this.load();
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
        this.playlistList.appendChild(element);
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
            items: <PlaylistDataItem[]>[],
            created: Date.now()
        };

        this.playlists.push(newPlaylist);

        this.constructPlaylistElement(newPlaylist);
        this.playlistList.appendChild(this.addPlaylistElement);

        SafeWriter.write(path.join(PlaylistSavePath, newPlaylist.name + ".playlist"), JSON.stringify(newPlaylist));
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

            this.playlists = mergeSorted(this.playlists, (a, b) => a.name < b.name);

            this.construct();
            this.emitEvent("load");
        });
    }
}