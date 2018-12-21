import { Song } from "./song";
import * as path from "path";

export class RenameRule
{
    public static getFilenameFor(song : Song, rule : string) : string
    {
        return path.join(path.dirname(song.filename), this.getBasenameFor(song, rule));
    }

    public static getBasenameFor(song : Song, rule : string) : string
    {
        let ogFilename = path.basename(song.filename);
        let ogExt = path.extname(ogFilename);
        let newFilename = "";

        let found = false;
        let foundi = 0;

        for (let i = 0; i < rule.length; i++)
        {
            if (rule[i] === "%")
            {
                if (!found)
                {
                    found = true;
                    foundi = i;
                }
                else
                {
                    found = false;
                    let token = rule.substr(foundi + 1, i - foundi - 1).toLowerCase();
                    if (this.isValidToken(token))
                    {
                        newFilename += this.parseToken(token, song);
                    }
                }
            }
            else if (!found)
            {
                newFilename += rule[i];
            }
        }

        return newFilename.replace(/[/\\?%*:|"<>]/g, "-") + ogExt;
    }

    private static tokenMap : { [ token : string ] : (song : Song) => string } =
    {
        "filename": song => path.parse(song.filename).name,
        "title": song => song.metadata.title,
        "artist": song => song.metadata.artist,
        "album": song => song.metadata.album
    };

    private static _tokenList : string[] = Object.keys(RenameRule.tokenMap);

    public static get tokenList() : string[]
    {
        return this._tokenList;
    }

    public static isValidToken(token : string)
    {
        return this.tokenMap.hasOwnProperty(token);
    }

    public static parseToken(token : string, song : Song) : string
    {
        return this.tokenMap[token](song);
    }
}