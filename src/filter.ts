import { Widget } from "./widget";
import { emptyFn, createElement, array_remove, array_remove_at } from "./util";

export class Filter extends Widget
{
    private filters : string[] = [];
    private input : HTMLInputElement;
    public onpreview : (filter : string) => void = emptyFn;
    public onfilter : (filter : string) => void = emptyFn;
    private tagElements : HTMLElement[] = [];

    constructor(container : HTMLElement)
    {
        super(container);

        this.input = <HTMLInputElement>createElement("input", "filter");
        this.input.type = "text";
        this.input.placeholder = "Search...";

        this.container.appendChild(this.input);
        
        this.input.addEventListener("input", this.inputFn.bind(this));
        this.input.addEventListener("keypress", this.keypressFn.bind(this));
        this.input.addEventListener("keydown", this.keydownFn.bind(this));
    }

    public get value() : string
    {
        return this.input.value;
    }

    public set value(value : string)
    {
        this.input.value = value;
    }

    public get filter() : string
    {
        return this.filters.map(filter => '(' + filter + ')').join(" ");
    }

    public get previewFilter() : string
    {
        return this.filter + " " + this.value;
    }

    public addFilter(filter : string, customName? : string) : void
    {
        this.filters.push(filter);
        this.genTagElement(this.filters.length - 1, customName);
        this.onfilter(this.filter);
    
        if (this.value !== "")
        {
            this.onpreview(this.previewFilter);
        }
    }

    public removeFilter(filter : number | HTMLElement, silent : boolean = false) : void
    {
        if (filter instanceof HTMLElement)
        {
            let index = this.tagElements.indexOf(filter);
            this.removeTagElement(filter);
            array_remove_at(this.filters, index);
        }
        else
        {
            this.removeTagElement(this.tagElements[filter]);
            array_remove_at(this.filters, filter);
        }

        if (!silent)
        {
            this.onfilter(this.filter);
            this.onpreview(this.previewFilter);
        }
    }

    public removeLastFilter(silent? : boolean) : void
    {
        this.removeFilter(this.filters.length - 1, silent);
    }

    public removeAllFilters(silent : boolean = false) : void
    {
        while (this.filters.length > 0)
        {
            this.removeFilter(0, true);
        }

        if (!silent)
        {
            this.onfilter(this.filter);

            if (this.previewFilter !== this.filter)
            {
                this.onpreview(this.previewFilter);
            }
        }
    }

    public clear(silent? : boolean) : void
    {
        this.removeAllFilters(silent);
        this.value = "";
    }

    private genTagElement(filterIndex : number, customName? : string) : void
    {
        let text = customName || this.filters[filterIndex];

        let t = createElement("div", "tag");
        
        let s = createElement("div", "text");
        s.innerText = text;
        s.title = text;
        t.appendChild(s);

        let r = createElement("div", "remove");
        r.innerText = "✕"
        t.addEventListener("click", () => this.removeFilter(t));
        t.appendChild(r);
        
        this.container.appendChild(t);

        let currentPaddingStyle = (getComputedStyle(this.input) as any)["padding-left"];
        let currentPadding = parseInt(currentPaddingStyle);

        let marginStyle = (getComputedStyle(t) as any)["margin-right"];
        let margin = parseInt(marginStyle);

        t.style.left = (currentPadding - margin) + "px";

        currentPadding += t.getBoundingClientRect().width + margin;

        (this.input.style as any)["padding-left"] = currentPadding + "px";

        this.tagElements.push(t);
    }

    private removeTagElement(t : HTMLElement)
    {
        let w = t.getBoundingClientRect().width;
        let index = this.tagElements.indexOf(t);

        let currentPaddingStyle = getComputedStyle(this.input).paddingLeft;
        let currentPadding = parseInt(currentPaddingStyle);

        let marginStyle = getComputedStyle(t).marginRight;
        let margin = parseInt(marginStyle);

        currentPadding -= w + margin;
        this.input.style.paddingLeft = currentPadding + "px";

        for (let i = index + 1; i < this.tagElements.length; i++)
        {
            let left = parseInt(this.tagElements[i].style.left);
            left -= w + margin;
            this.tagElements[i].style.left = left.toString() + "px";
        }

        array_remove(this.tagElements, t);
        this.container.removeChild(t);
    }

    private inputFn() : void
    {
        this.onpreview(this.previewFilter);
    }

    private keypressFn(e : KeyboardEvent) : void
    {
        if (e.which === 13) // enter
        {
            if (this.value)
            {
                let val = this.value;
                this.value = "";
                this.addFilter(val);
            }
        }
    }

    private keydownFn(e : KeyboardEvent) : void
    {
        if (e.key === "Backspace")
        {
            if (this.value === "")
            {
                if (this.filters.length > 0)
                {
                    this.removeLastFilter();
                }
            }
        }
    }
}