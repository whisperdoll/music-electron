import { PlaylistItem } from "./playlistitem";

export class PickOneItem extends PlaylistItem
{
    private _path : string;

    constructor(path : string)
    {
        super();

        this._path = path;
    }

    // override //
    protected makeFilterList() : void
    {

    }

    // override //
    public getProperty(property : string) : any
    {

    }

    // override //
    protected matchesFilterPart(filterPart : string) : boolean
    {
        return false;
    }

    // override //
    public retrieveMetadata(callback? : Function) : void
    {

    }

    // override //
    public hasFid(fid : string) : boolean
    {
        return false;
    }

    // override //
    public hasFilename(filename : string) : boolean
    {
        return false;
    }

    // override //
    public getFilename() : string
    {
        return "aaa";
    }
}