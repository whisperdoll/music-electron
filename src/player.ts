import { Widget } from "./widget";
import { fileExists, getUserDataPath, getCacheFilename, getFileId, emptyFn, getRainbowColor, getCurrentMs } from "./util";
import * as path from "path"
import * as fs from "fs"
import { SafeWriter } from "./safewriter";

const WaveSurfer = require("wavesurfer.js");

export class Player extends Widget
{
    private wavesurfer : any;
    private currentFilename : string = "";
    private lastTime : number;
    private listenedMs : number;
    private listenedSwitch : boolean = false;

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
            this.lastTime = getCurrentMs();
            this.listenedMs = 0;
            this.listenedSwitch = false;
            this.wavesurfer.play();
            this.emitEvent("play");
            this.emitEvent("load");
        });

        this.wavesurfer.on("finish", () =>
        {
            this.emitEvent("songfinish");
        });

        this.wavesurfer.on("audioprocess", () =>
        {
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

                this.emitEvent("step");
            }
        });
    }

    public get mediaElement() : HTMLMediaElement
    {
        return this.wavesurfer.backend.media;
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
        if (filename && filename !== this.currentFilename)
        {
            this.currentFilename = filename;

            getFileId(this.currentFilename, fid =>
            {
                fs.readFile(this.getCacheFilename(fid), "utf8", (err, data) =>
                {
                    if (err)
                    {
                        if (err.code === "ENOENT") // file not found
                        {
                            this.cacheWaveform(fid);
                            this.wavesurfer.load(filename);
                        }
                        else
                        {
                            throw err;
                        }
                    }
                    else
                    {
                        this.wavesurfer.load(filename, JSON.parse(data));
                    }
                });
            });

            return true;
        }
        else if (!this.currentFilename)
        {
            return false;
        }
        else
        {
            if (restart)
            {
                this.seekMs(0);
                this.listenedSwitch = false;
                this.listenedMs = 0;
            }
            
            this.lastTime = getCurrentMs();
            this.wavesurfer.play();
            this.emitEvent("play");
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

    private cacheWaveform(fid : string) : void
    {
        //this.wavesurfer.un("waveform-ready");
        let str = this.wavesurfer.exportPCM(undefined, undefined, true, undefined);
        SafeWriter.write(this.getCacheFilename(fid), str, undefined, fid);
    }
}