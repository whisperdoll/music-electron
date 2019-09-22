import * as path from "path";
import { getUserDataPath } from "./util";

export let PlaylistSavePath : string = path.join(getUserDataPath(), "myplaylists/");

export interface PlaylistPath
{
    path : string;
    exclude? : string[];
    filter? : string;
    sort? : string;
};

export interface PlaylistData
{
    name : string;
    paths : PlaylistPath[];
    filter : string;
    sort : string;
    created : number;
};