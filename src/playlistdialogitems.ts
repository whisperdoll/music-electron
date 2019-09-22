import { Widget } from "./widget";
import { createElement, array_remove, isFile } from "./util";
import { PlaylistData, PlaylistPath } from "./playlistdata";
const { dialog } = require("electron").remote;
import * as npath from "path";
import { Playlist } from "./playlist";

export class PlaylistDialogItems extends Widget
{
    private addButtonContainer : HTMLElement;
    private addSongButton : HTMLElement;
    private addPathButton : HTMLElement;

    private items : PlaylistDialogItem[] = [];

    constructor()
    {
        super("items");
        
        this.addButtonContainer = createElement("div", "addButtons");
        this.addSongButton = createElement("button", "addSong");
        this.addSongButton.innerText = "Add Song";
        this.addPathButton = createElement("button", "addPath");
        this.addPathButton.innerText = "Add Path";
        this.addButtonContainer.appendChild(this.addSongButton);
        this.addButtonContainer.appendChild(this.addPathButton);

        this.addPathButton.addEventListener("click", () => this.addPath());
        this.addSongButton.addEventListener("click", () => this.addSong());

        let container = createElement("div", "innerContainer");

        this.appendChild(container, this.addButtonContainer);

        this.contentContainer = container;
    }

    public get paths() : PlaylistPath[]
    {
        return this.items.map(item => item.path);
    }

    public set paths(paths : PlaylistPath[])
    {
        this.clear();
        this.items = [];
        paths.forEach((path) =>
        {
            if (isFile(path.path))
            {
                this.addSongPath(path);
            }
            else
            {
                this.addPathPath(path);
            }
        });
    }

    private addSong() : void
    {
        let paths = dialog.showOpenDialog({
            title: "Add Song...",
            filters:
            [
                {
                    name: "Music file",
                    extensions: Playlist.allowedExtensions
                },
                {
                    name: "All Files",
                    extensions: ["*"]
                }
            ],
            properties: [ "openFile", "multiSelections" ]
        });

        if (paths)
        {
            paths.forEach((path) =>
            {
                this.addSongPath({ path: path });
            });
        }
    }

    private addSongPath(playlistPath : PlaylistPath)
    {
        let item = new PlaylistDialogSongItem(playlistPath);
        this.items.push(item);
        this.appendChild(item.container);

        item.on("requestremove", () =>
        {
            array_remove(this.items, item);
            this.removeChild(item.container);
        });
    }

    private addPath() : void
    {
        let paths = dialog.showOpenDialog({
            title: "Add Path...",
            properties: [ "openDirectory", "multiSelections" ]
        });

        if (paths)
        {
            paths.forEach((path) =>
            {
                this.addPathPath({ path: path });
            });
        }
    }

    private addPathPath(playlistPath : PlaylistPath) : void
    {
        let item = new PlaylistDialogPathItem(playlistPath);
        this.items.push(item);
        this.appendChild(item.container);

        item.on("requestremove", () =>
        {
            array_remove(this.items, item);
            this.removeChild(item.container);
        });
    }
}

abstract class PlaylistDialogItem extends Widget
{
    private removeButton : HTMLElement;

    constructor(className : string)
    {
        super("item " + className);
        this.createEvent("requestremove");

        this.removeButton = createElement("button", "remove");
        this.removeButton.innerText = "Remove";
        this.removeButton.addEventListener("click", () =>
        {
            this.emitEvent("requestremove");
        });

        let container = createElement("div", "innerContainer");

        this.appendChild(container, this.removeButton);
        this.contentContainer = container;
    }

    public abstract get path() : PlaylistPath;
}

class PlaylistDialogSongItem extends PlaylistDialogItem
{
    private input : HTMLInputElement;

    constructor(playlistPath? : PlaylistPath)
    {
        super("song");

        this.input = <HTMLInputElement>createElement("input");
        this.input.type = "text";
        if (playlistPath)
        {
            this.input.value = playlistPath.path;
        }
        this.input.addEventListener("click", () =>
        {
            let path = dialog.showOpenDialog({
                title: "Add Song...",
                filters:
                [
                    {
                        name: "Music file",
                        extensions: Playlist.allowedExtensions
                    },
                    {
                        name: "All Files",
                        extensions: ["*"]
                    }
                ],
                properties: [ "openFile" ]
            });

            if (path && path.length > 0)
            {
                this.input.value = path[0];
            }
        });

        let label = createElement("div", "label");
        label.innerText = "Song";

        this.appendChild(label, this.input);
    }

    public get path() : PlaylistPath
    {
        return {
            path: npath.normalize(this.input.value)
        };
    }
}

class PlaylistDialogPathItem extends PlaylistDialogItem
{
    private pathInput : HTMLInputElement;
    private sortInput : HTMLInputElement;
    private filterInput : HTMLInputElement;
    private excludeInput : HTMLInputElement;

    constructor(playlistPath? : PlaylistPath)
    {
        super("song");

        this.pathInput = <HTMLInputElement>createElement("input");
        this.pathInput.type = "text";
        this.pathInput.addEventListener("click", () =>
        {
            let path = dialog.showOpenDialog({
                title: "Add Path...",
                properties: [ "openDirectory" ]
            });

            if (path && path.length > 0)
            {
                this.pathInput.value = path[0];
            }
        });

        this.sortInput = <HTMLInputElement>createElement("input");
        this.sortInput.type = "text";
        this.filterInput = <HTMLInputElement>createElement("input");
        this.filterInput.type = "text";
        this.excludeInput = <HTMLInputElement>createElement("input");
        this.excludeInput.type = "text";

        if (playlistPath)
        {
            this.pathInput.value = playlistPath.path || "";
            this.sortInput.value = playlistPath.sort || "";
            this.filterInput.value = playlistPath.filter || "";
            this.excludeInput.value = playlistPath.exclude ? playlistPath.exclude.join(";") : "";
        }

        let l = (text : string) =>
        {
            let r = createElement("div", "label");
            r.innerText = text;
            return r;
        };
        
        this.appendChild(
            l("Path"),
            this.pathInput,
            l("Sort"),
            this.sortInput,
            l("Filter"),
            this.filterInput,
            l("Exclude"),
            this.excludeInput
        );
    }

    public get path() : PlaylistPath
    {
        return {
            path: npath.normalize(this.pathInput.value),
            exclude: this.excludeInput.value.split(";").map(p => npath.normalize(p)),
            filter: this.filterInput.value,
            sort: this.sortInput.value
        };
    }
}