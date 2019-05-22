import { Widget } from "./widget";
import { fileExists, getUserDataPath, getFileId, createElement, getRainbowColor, getCurrentMs, array_contains, isFileNotFoundError, getFileIdSync, array_remove_all } from "./util";
import * as path from "path"
import * as fs from "fs"
import { SafeWriter } from "./safewriter";
import { FunctionQueue } from "./functionqueue";

const WaveSurfer = require("wavesurfer.js");

export class Player extends Widget
{
    private wavesurfer : any;
    private currentFilename : string = "";
    private currentFid : string = "";
    private lastTime : number;
    private listenedMs : number;
    private listenedSwitch : boolean = false;
    private wantingToCacheFids : string[] = [];
    private _playNext : string;
    private awaitingPlayback : boolean = false;

    constructor(container : HTMLElement)
    {
        super(container);

        this.createEvent("load");
        this.createEvent("songfinish");
        this.createEvent("play");
        this.createEvent("pause");
        this.createEvent("stop");
        this.createEvent("listencount");
        this.createEvent("step");

        if (!fileExists(this.cachePath))
        {
            fs.mkdirSync(this.cachePath);
        }

        /*this.cachingQueue = new FunctionQueue(3, (cb : Function, filename : string, fid : string) =>
        {
            let ws = WaveSurfer.create({
                container: createElement("div"),
                closeAudioContext: true
            });

            ws.on("ready", () =>
            {
                let str = ws.exportPCM(undefined, undefined, true, undefined);
                SafeWriter.write(this.getCacheFilename(fid), str, (err) =>
                {
                    if (err)
                    {
                        throw err;
                    }

                    console.log("wrote waveform cache for " + filename);
                    ws.destroy();
                    cb();
                }, fid);
            });

            ws.load(filename);
        });*/

        this.wavesurfer = WaveSurfer.create({
            container: this.container,
            waveColor: "#eee",
            progressColor: "#aaa",
            cursorColor: "transparent",
            barWidth: 2,
            barGap: 1,
            height: 76,
            responsive: 0,
            barHeight: 0.8,
            backend: "MediaElement",
            progressColorFn: getRainbowColor
        });

        this.wavesurfer.on("ready", () =>
        {
            console.log("ready: " + this.currentFilename);
            this.lastTime = getCurrentMs();
            this.listenedMs = 0;
            this.listenedSwitch = false;
            this.wavesurfer.play();
            this.emitEvent("load");
        });

        this.wavesurfer.on("waveform-ready", () =>
        {
            if (array_remove_all(this.wantingToCacheFids, this.currentFid).existed)
            {
                this.cacheWaveform(this.currentFilename, this.currentFid);
            }
        });

        this.wavesurfer.on("finish", () =>
        {
            this.emitEvent("songfinish");
        });

        this.wavesurfer.on("audioprocess", () =>
        {
            this.emitEvent("step");
        });

        setInterval(() => {
            //console.log(this.awaitingPlayback, this.mediaElement.currentTime > 0, !this.mediaElement.paused, !this.mediaElement.ended, this.mediaElement.readyState > 2, this.currentFilename);

            if (!this.listenedSwitch)
            {
                let elapsed = getCurrentMs() - this.lastTime;
                this.listenedMs += elapsed;
                this.lastTime = getCurrentMs();
    
                if (this.listenedMs >= 30000)
                {
                    this.emitEvent("listencount");
                    this.listenedSwitch = true;
                }
            }

            if (this.awaitingPlayback && this.trulyPlaying)
            {
                console.log("awaitingplayback gone: " + this.currentFilename);
                this.awaitingPlayback = false;
                
                if (this._playNext)
                {
                    let n = this._playNext;
                    this._playNext = null;
                    this.play(n);
                }
                
                this.emitEvent("play");
            }
        }, 1000);
    }

    public get mediaElement() : HTMLMediaElement
    {
        return this.wavesurfer.backend.media;
    }

    public get trulyPlaying() : boolean
    {
        return this.mediaElement.currentTime > 0 && !this.mediaElement.paused && !this.mediaElement.ended && this.mediaElement.readyState > 2;
    }

    private get cachePath() : string
    {
        return path.join(getUserDataPath() + "/pcm/");
    }

    private getCacheFilename(fid : string) : string
    {
        return path.join(this.cachePath, fid + ".waveform");
    }

    public set volume(volume : number)
    {
        this.wavesurfer.setVolume(volume);
    }

    public get volume() : number
    {
        return this.wavesurfer.getVolume();
    }

    public stop() : void
    {
        this.wavesurfer.empty();
        this.emitEvent("stop");
    }

    public play(filename? : string, restart : boolean = false) : boolean
    {
        if (this.awaitingPlayback)
        {
            this._playNext = filename;
            console.log("not playing: " + filename);
            return true;
        }

        console.log("actually playing: " + filename);

        if (filename && filename !== this.currentFilename)
        {
            this.currentFilename = filename;
            this.currentFid = getFileIdSync(this.currentFilename);
            this.awaitingPlayback = true;
            console.log("now awaiting playback: " + this.currentFilename);

            let data : string;

            try
            {
                data = fs.readFileSync(this.getCacheFilename(this.currentFid), "utf8");
                this.wavesurfer.load(filename.replace(/\#/g, "%23"), JSON.parse(data));
            }
            catch (err)
            {
                if (isFileNotFoundError(err))
                {
                    this.wavesurfer.load(filename.replace(/\#/g, "%23"));
                    this.wantingToCacheFids.push(this.currentFid);
                }
            }

            return true;
        }
        else if (!this.currentFilename)
        {
            return false;
        }
        else
        {
            this.awaitingPlayback = true;
            console.log("now awaiting playback2: " + this.currentFilename);

            if (restart)
            {
                this.seekMs(0);
                this.listenedSwitch = false;
                this.listenedMs = 0;
            }
            
            this.lastTime = getCurrentMs();
            this.wavesurfer.play();
            return true;
        }
    }

    public pause()
    {
        this.wavesurfer.pause();
        this.emitEvent("pause");
    }

    public seekMs(ms : number) : void
    {
        this.wavesurfer.seekTo(ms / this.durationMs);
    }

    public get currentTimeMs() : number
    {
        return this.wavesurfer.getCurrentTime() * 1000;
    }

    public get currentTimeMinSec() : string
    {
        let nsecs = Math.floor(this.wavesurfer.getCurrentTime() % 60);
        let nmins = Math.floor(this.wavesurfer.getCurrentTime() / 60);
        let secs : string;
        let mins : string;

        if (isNaN(nsecs))
        {
            secs = "--";
        }
        else
        {
            secs = nsecs.toString();
        }

        if (isNaN(nmins))
        {
            mins = "--";
        }
        else
        {
            mins = nmins.toString();
        }


        if (secs.length === 1)
        {
            secs = "0" + secs;
        }
        if (mins.length === 1)
        {
            mins = "0" + mins;
        }

        return mins + ":" + secs;
    }

    public get durationMs() : number
    {
        return this.wavesurfer.getDuration() * 1000;
    }

    public get durationMinSec() : string
    {
        let nsecs = Math.floor(this.wavesurfer.getDuration() % 60);
        let nmins = Math.floor(this.wavesurfer.getDuration() / 60);
        let secs : string;
        let mins : string;

        if (isNaN(nsecs))
        {
            secs = "--";
        }
        else
        {
            secs = nsecs.toString();
        }

        if (isNaN(nmins))
        {
            mins = "--";
        }
        else
        {
            mins = nmins.toString();
        }

        if (secs.length === 1)
        {
            secs = "0" + secs;
        }
        if (mins.length === 1)
        {
            mins = "0" + mins;
        }

        return mins + ":" + secs;
    }

    private cacheWaveform(filename : string, fid : string) : void
    {
        let str = this.wavesurfer.exportPCM(undefined, undefined, true, undefined);
        fs.writeFileSync(this.getCacheFilename(fid), str, "utf8");
        // console.log("cached waveform for " + filename);
    }
}