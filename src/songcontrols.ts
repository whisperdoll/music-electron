import { Widget } from "./widget";
import { createElement, emptyFn } from "./util";

export class SongControls extends Widget
{
    private playPauseButton : HTMLElement;
    private previousButton : HTMLElement;
    private nextButton : HTMLElement;

    public onplay : () => boolean = () => false;
    public onpause : () => void = emptyFn;
    public onprevious : () => void = emptyFn;
    public onnext : () => void = emptyFn;

    private showingPlay : boolean = true;

    constructor(container : HTMLElement)
    {
        super(container);

        this.previousButton = createElement("button", "svgButton previous");
        this.previousButton.addEventListener("click", this.previous.bind(this));
        this.container.appendChild(this.previousButton);

        this.playPauseButton = createElement("button", "svgButton playPause play");
        this.playPauseButton.addEventListener("click", this.playPause.bind(this));
        this.container.appendChild(this.playPauseButton);

        this.nextButton = createElement("button", "svgButton next");
        this.nextButton.addEventListener("click", this.next.bind(this));
        this.container.appendChild(this.nextButton);
    }

    public showPause()
    {
        this.showingPlay = false;
        this.playPauseButton.classList.remove("play");
        this.playPauseButton.classList.add("pause");
    }

    public showPlay()
    {
        this.showingPlay = true;
        this.playPauseButton.classList.remove("pause");
        this.playPauseButton.classList.add("play");
    }

    public playPause()
    {
        if (this.showingPlay)
        {
            this.play();
        }
        else
        {
            this.pause();
        }
    }

    private play()
    {
        if (this.onplay())
        {
        }
    }

    private pause()
    {
        this.onpause();
    }

    private next()
    {
        this.onnext();
    }

    private previous()
    {
        this.onprevious();
    }
}