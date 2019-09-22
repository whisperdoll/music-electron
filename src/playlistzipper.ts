const edialog = require("electron").remote.dialog;
import * as fs from "fs";
import * as npath from "path";
import * as archiver from "archiver";
import { revealInExplorer, isFileNotFoundError } from "./util";
import { Playlist } from "./playlist";
import { Dialog } from "./dialog";
import { PlaylistData } from "./playlistdata";


const zipOverlay : Dialog = new Dialog(false);
zipOverlay.appendHTML("Please wait,,,");
document.body.appendChild(zipOverlay.container);

export function exportZip(playlistData : PlaylistData)
{
    let savePath = edialog.showSaveDialog(
        {
            filters:
            [
                {
                    name: "ZIP file",
                    extensions: [ "zip" ]
                }
            ]
        }
    );

    if (!savePath)
    {
        return;
    }

    zipOverlay.show();

    let output = fs.createWriteStream(savePath);
    let archive = archiver("zip");

    output.on("close", () =>
    {
        zipOverlay.hide();
        revealInExplorer(savePath);
    });

    archive.on("warning", (err) =>
    {
        if (isFileNotFoundError(err))
        {
            console.log(err);
        }
        else
        {
            throw err;
        }
    });

    archive.on("error", (err) =>
    {
        throw err;
    });

    archive.pipe(output);

    let playlist : Playlist = new Playlist((whoCares : PlaylistData) => {});
    playlist.on("load", () =>
    {
        let filenames = playlist.filenames;
        
        filenames.forEach((filename, i) =>
        {
            let pad = Math.max(2, filenames.length.toString().length);
    
            archive.file(filename, { name: i.toString().padStart(pad, "0") + " - " + npath.basename(filename) });
        });
    
        archive.finalize();
    });
    playlist.loadPlaylist(playlistData);
}