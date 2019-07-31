import * as path from "path";
import { getUserDataPath } from "./util";

export let PlaylistSavePath : string = path.join(getUserDataPath(), "myplaylists/");

export interface PlaylistData
{
    name : string,
    paths : string[],
    created : number
}