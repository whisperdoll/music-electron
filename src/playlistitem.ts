import { EventClass } from "./eventclass";

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

export abstract class PlaylistItem extends EventClass
{
    private static idCounter = 0;
    
    protected _loaded : boolean = false;
    protected filterList : string[];
    public metadata : Metadata;
    public readonly id : string;

    constructor()
    {
        super();

        this.createEvent("load");
        this.on("load", () =>
        {
            this._loaded = true;
            this.makeFilterList();
        });

        this.id = PlaylistItem.genId();
    }

    private static genId() : string
    {
        return (this.idCounter++).toString();
    }

    public load() : void
    {
        if (!this.metadata)
        {
            this.retrieveMetadata(() =>
            {
                this.emitEvent("load");
            });
        }
        else
        {
            this.emitEvent("load");
        }
    }

    protected abstract makeFilterList() : void;
    public abstract getProperty(property : string) : any;
    protected abstract matchesFilterPart(filterPart : string) : boolean;
    public abstract retrieveMetadata(callback? : Function) : void;
    public abstract hasFid(fid : string) : boolean;
    public abstract hasFilename(filename : string) : boolean;
    public abstract getFilename() : string;

    public get loaded() : boolean
    {
        return this._loaded;
    }

    public matchesFilter(filter : string) : boolean
    {
        if (!filter)
        {
            return true;
        }

        if (filter.length > 1 && filter[0] === '(' && filter[filter.length - 1] === ')')
        {
            filter = filter.substr(1, filter.length - 2);
            return this.matchesFilter(filter);
        }

        filter = filter.replace(/&/g, " ").trim();
        while (filter.indexOf("  ") !== -1)
        {
            filter = filter.replace(/  /g, " ");
        }

        let pcounter = 0;
        let quoteSwitch = false;
        for (let i = 0; i < filter.length; i++)
        {
            if (filter[i] === "\\" && filter[i - 1] !== "\\")
            {
                i++;
                continue;
            }

            if (filter[i] === '"')
            {
                quoteSwitch = !quoteSwitch;
            }
            else if (!quoteSwitch)
            {
                if (filter[i] === "(")
                {
                    pcounter++;
                }
                else if (filter[i] === ")" && pcounter > 0)
                {
                    pcounter--;
                }
                else if (filter[i] === "|" && pcounter === 0)
                {
                    let left = filter.substr(0, i);
                    let right = filter.substr(i + 1);
                    return this.matchesFilter(left) || this.matchesFilter(right);
                }
            }
        }
        
        pcounter = 0;
        quoteSwitch = false;
        for (let i = 0; i < filter.length; i++)
        {
            if (filter[i] === "\\" && filter[i - 1] !== "\\")
            {
                i++;
                continue;
            }

            if (filter[i] === '"')
            {
                quoteSwitch = !quoteSwitch;
            }
            else if (!quoteSwitch)
            {
                if (filter[i] === "(")
                {
                    pcounter++;
                }
                else if (filter[i] === ")" && pcounter > 0)
                {
                    pcounter--;
                }
                else if ((filter[i] === " ") && pcounter === 0)
                {
                    let left = filter.substr(0, i);
                    let right = filter.substr(i + 1);
                    return this.matchesFilter(left) && this.matchesFilter(right);
                }
            }
        }

        if (filter.length > 1 && filter[0] === '"' && filter[filter.length - 1] === '"')
        {
            filter = filter.substr(1, filter.length - 2);
        }

        return this.matchesFilterPart(filter);
    }
}