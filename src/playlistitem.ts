export interface Metadata
{
    title : string,
    artist : string,
    album : string,
    length : number,
    picture : string,
    plays : number,
    track : number
}

export class PlaylistItem extends EventClass
{
    private _loaded : boolean = false;

    constructor(metadata? : Metadata)
    {
        this.metadata = metadata;
    }

    public get loaded() : boolean
    {
        return this._loaded;
    }

    public load() : void
    {
        
    }
}