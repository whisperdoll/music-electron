import * as npath from "path";
import * as fs from "fs";
import { getUserDataPath, bigintStat } from "./util";
import { Metadata } from "./song";
import { SafeWriter } from "./safewriter";

export class FileCache
{
    private static cacheFilename = npath.join(getUserDataPath(), "songs.cache");
    private static cacheFid : string;
    public static metadata : { [fid : string] : Metadata };

    public static loadMetadata() : void
    {
        let data;

        try
        {
            data = fs.readFileSync(this.cacheFilename, "utf8");
        }
        catch (err)
        {
            if (err.code === "ENOENT")
            {
                data = JSON.stringify({});
                fs.writeFileSync(this.cacheFilename, data, "utf8");
            }
            else
            {
                throw err;
            }
        }

        this.metadata = JSON.parse(data);
        
        bigintStat(this.cacheFilename, (err, stat) =>
        {
            if (err)
            {
                throw err;
            }

            this.cacheFid = stat.ino.toString();
        }); 
    }

    public static writeCache(cb? : (err : Error) => void) : void
    {
        SafeWriter.write(this.cacheFilename, JSON.stringify(this.metadata), cb, this.cacheFid);
    }
}