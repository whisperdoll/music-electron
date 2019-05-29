import * as path from "path";
import { getUserDataPath } from "./util";

export let PlaylistSavePath : string = path.join(getUserDataPath(), "myplaylists/");

type PlaylistDataItemType = "song" | "path";

export interface SongData
{
    filename : string
}

export interface PathData
{
    path : string,
    filter : string,
    pickOne : boolean
}

export interface PlaylistDataItem
{
    type : PlaylistDataItemType,
    data : any
}

export interface PlaylistData
{
    name : string,
    items : PlaylistDataItem[],
    created : number
}