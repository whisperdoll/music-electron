import { Widget } from "./widget";
import { createElement, getRainbowColor } from "./util";
const Clubber = require("clubber");

export class Spectrum extends Widget
{
    private mediaElement : HTMLMediaElement;
    private clubber : any;
    private bands : any = {};
    private _started : boolean = false;
    private arrays : any = {};
    private canvas : HTMLCanvasElement;

    constructor()
    {
        super(createElement("div", "spectrum"));

        this.canvas = <HTMLCanvasElement>createElement("canvas");
        this.canvas.width = 1024;
        this.canvas.height = 400;
        this.appendChild(this.canvas);

        this.clubber = new Clubber({
            size: 2048,
            mute: false
        });

        this.arrays.all = new Float32Array(4);
        this.bands.all = this.clubber.band({
            template: "0123", // alternately [0, 1, 2, 3]
            from: 1, // minimum midi note to watch
            to: 128, // maximum midi note, up to 160
            low: 64, // Low velocity/power threshold
            high: 128, // High velocity/power threshold
            smooth: [0.1, 0.1, 0.1, 0.1], // Exponential smoothing factors for the values
            adapt: [1, 1, 1, 1], // Adaptive bounds setup
            snap: 0.33
        });

        this.arrays.bass = new Float32Array(4);
        this.bands.bass = this.clubber.band({
            template: "0123", // alternately [0, 1, 2, 3]
            from: 70, // minimum midi note to watch
            to: 100, // maximum midi note, up to 160
            low: 1, // Low velocity/power threshold
            high: 128, // High velocity/power threshold
            smooth: [0.1, 0.1, 0.1, 0.1], // Exponential smoothing factors for the values
            adapt: [1, 1, 1, 1], // Adaptive bounds setup
            snap: 0.33
        });

        this.arrays.h = new Float32Array(4);
        this.bands.h = this.clubber.band({
            template: "0123", // alternately [0, 1, 2, 3]
            from: 60, // minimum midi note to watch
            to: 100, // maximum midi note, up to 160
            low: 1, // Low velocity/power threshold
            high: 128, // High velocity/power threshold
            smooth: [0.1, 0.1, 0.1, 0.1], // Exponential smoothing factors for the values
            adapt: [1, 1, 1, 1], // Adaptive bounds setup
            snap: 0.33
        });

        this.arrays.high = new Float32Array(4);
        this.bands.high = this.clubber.band({
            template: "0123", // alternately [0, 1, 2, 3]
            from: 100, // minimum midi note to watch
            to: 120, // maximum midi note, up to 160
            low: 1, // Low velocity/power threshold
            high: 128, // High velocity/power threshold
            smooth: [0.1, 0.1, 0.1, 0.1], // Exponential smoothing factors for the values
            adapt: [1, 1, 1, 1], // Adaptive bounds setup
            snap: 0.33
        });
    }

    private render() : void
    {
        this.clubber.update();
        this.bands.all(this.arrays.all);
        this.bands.bass(this.arrays.bass);
        this.bands.h(this.arrays.h);
        this.bands.high(this.arrays.high);

        let ctx = this.canvas.getContext("2d");
        let w = this.canvas.width;
        let h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);
        let bw = w / this.clubber.notes.length;

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "white";
        ctx.fillStyle = "white";
        ctx.lineJoin = "round";
        ctx.moveTo(0, h);
        
        for (let i = 0; i < this.clubber.notes.length; i++)
        {
            let factor = (this.arrays.all[2] * 0.2) + (Math.sqrt(this.arrays.h[2]) * 0.6) + (this.arrays.high[2] * 0.2);
            factor /= 2;
            let value = h - (this.clubber.notes[i] / 255) * h * factor;

            ctx.lineTo(bw * i, value);

            ctx.fillStyle = getRainbowColor(i / this.clubber.notes.length);
            ctx.fillRect(i * bw, value, bw, h - value);
        }

        ctx.lineTo(w, h);
        //ctx.fill();

        let of = this.arrays.bass[3] * this.arrays.all[3];
        this.canvas.style.opacity = (0 + (0.2 * of)).toString();
    }

    public start(mediaElement : HTMLMediaElement)
    {
        this.mediaElement = mediaElement;
        this.clubber.listen(mediaElement);

        if (!this._started)
        {
            let r = () =>
            {
                this.render();
                window.requestAnimationFrame(r);
            };

            window.requestAnimationFrame(r);
        }
    }
}