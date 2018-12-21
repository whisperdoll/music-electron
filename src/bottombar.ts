import { Widget } from "./widget";
import { createElement, emptyFn } from "./util";
import { SongControls } from "./songcontrols";
import { Player } from "./player";

let initPrimary = "play a song dumpass";
let initSecondary = "poopie";

export class BottomBar extends Widget
{
    private controls : SongControls;
    public wavebar : HTMLElement;
    private miscContainer : HTMLElement;
    private songLengthLabel : HTMLElement;
    private shuffleButton : HTMLElement;
    private volumeSlider : HTMLInputElement;
    private shuffleOn : boolean = false;
    private primaryLabel : HTMLElement;
    private secondaryLabel : HTMLElement;

    constructor(container : HTMLElement)
    {
        super(container);

        this.createEvent("shuffleon");
        this.createEvent("shuffleoff");
        this.createEvent("primaryclick");
        this.createEvent("secondaryclick");
        

        this.primaryLabel = createElement("div", "primaryLabel");
        this.primaryLabel.innerText = initPrimary;
        this.secondaryLabel = createElement("div", "secondaryLabel");
        this.secondaryLabel.innerText = initSecondary;

        this.primaryLabel.addEventListener("click", () =>
        {
            this.emitEvent("primaryclick");
        });
        this.secondaryLabel.addEventListener("click", () =>
        {
            this.emitEvent("secondaryclick");
        });

        this.controls = new SongControls(createElement("div", "songControls"));
        this.wavebar = createElement("div", "wavebar");

        this.songLengthLabel = createElement("div", "songLength");
        this.songLengthLabel.innerText = "--:-- / --:--";

        this.volumeSlider = <HTMLInputElement>createElement("input", "volume");
        this.volumeSlider.type = "range";
        this.volumeSlider.max = "1";
        this.volumeSlider.min = "0";
        this.volumeSlider.step = "0.01";

        this.shuffleButton = createElement("button", "shuffle svgButton");
        this.shuffleButton.addEventListener("click", () =>
        {
            this.shuffleOn = !this.shuffleOn;
            this.emitEvent(this.shuffleOn ? "shuffleon" : "shuffleoff");

            if (this.shuffleOn)
            {
                this.shuffleButton.classList.add("active");
            }
            else
            {
                this.shuffleButton.classList.remove("active");
            }
        });

        this.miscContainer = createElement("div", "misc");
        this.miscContainer.appendChild(this.volumeSlider);
        this.miscContainer.appendChild(this.shuffleButton);

        this.appendChild(
            this.primaryLabel,
            this.secondaryLabel,
            this.controls,
            this.miscContainer,
            this.songLengthLabel,
            this.wavebar
        );
    }

    public reset()
    {
        this.songLengthLabel.innerText = "--:-- / --:--";
        this.primaryLabel.innerText = initPrimary;
        this.secondaryLabel.innerText = initSecondary;
        this.controls.showPlay();
    }

    public hookPlayer(player : Player)
    {
        player.on("play", () =>
        {
            this.controls.showPause();
        });

        player.on("pause", () =>
        {
            this.controls.showPlay();
        });

        player.on("stop", () =>
        {
            this.controls.showPlay();
        });

        player.on("step", () =>
        {
            this.songLengthLabel.innerText = player.currentTimeMinSec + " / " + player.durationMinSec;
        });

        this.volumeSlider.addEventListener("input", () =>
        {
            player.volume = parseFloat(this.volumeSlider.value);
        });
    }

    public set primaryString(str : string)
    {
        this.primaryLabel.innerText = str;
        this.primaryLabel.title = str;
    }

    public set secondaryString(str : string)
    {
        this.secondaryLabel.innerText = str;
        this.secondaryLabel.title = str;
    }

    public playPause() : void
    {
        this.controls.playPause();
    }

    public set onplaypressed(fn : () => boolean)
    {
        this.controls.onplay = fn;
    }

    public set onpausepressed(fn : () => void)
    {
        this.controls.onpause = fn;
    }

    public set onnextpressed(fn : () => void)
    {
        this.controls.onnext = fn;
    }

    public set onpreviouspressed(fn : () => void)
    {
        this.controls.onprevious = fn;
    }
}