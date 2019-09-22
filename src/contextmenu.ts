import { Widget } from "./widget";
import { emptyFn, createElement } from "./util";

export class ContextMenu extends Widget
{
    public items : ContextMenuItem[] = [];

    constructor()
    {
        super("contextMenu");

        document.body.addEventListener("mousedown", () =>
        {
            this.hide();
        });

        this.hide();
    }

    public addItem(item : ContextMenuItem) : void
    {
        item.parent = this;
        this.appendChild(item);
        this.items.push(item);
    }

    public show(x? : number, y? : number)
    {
        if (x !== undefined)
        {
            this.x = x;
        }

        if (y !== undefined)
        {
            this.y = y;
        }

        super.show();

        this.items.forEach(item => item.hideIfNecessary());
    }

    public set x(x : number)
    {
        this.container.style.left = x + "px";
    }

    public get x() : number
    {
        return parseFloat(window.getComputedStyle(this.container).left);
    }

    public set y(y : number)
    {
        this.container.style.top = y + "px";
    }

    public get y() : number
    {
        return parseFloat(window.getComputedStyle(this.container).top);
    }

    public hide() : void
    {
        super.hide();
        this.items.forEach(item => item.hideSubmenu());
    }
}

export class ContextMenuItem extends Widget
{
    private _text : string;
    public onclick : () => void;

    private textContainer : HTMLElement;
    private _subMenu : ContextMenu;
    public parent : ContextMenu;
    public showCondition : () => boolean = () => true;

    public hint : any;

    constructor(text : string, onclick : () => void = emptyFn, showCondition? : () => boolean)
    {
        super("contextMenuItem");

        if (showCondition)
        {
            this.showCondition = showCondition;
        }

        this.textContainer = createElement("div", "text");
        this.container.appendChild(this.textContainer);

        this.text = text;
        this.onclick = onclick;

        this.container.addEventListener("mousedown", (e) =>
        {
            if (this.parent)
            {
                this.parent.hide();
            }

            this.onclick();
        });

        this.container.addEventListener("mouseenter", () =>
        {
            this.parent.items.forEach(item =>
            {
                if (item.subMenu)
                {
                    item.subMenu.hide();
                }
            });

            if (this.subMenu)
            {
                this.subMenu.show(
                    this.parent.x + this.container.offsetWidth,
                    this.parent.y + this.container.offsetTop
                );
            }
        });
    }

    public hideIfNecessary() : void
    {
        if (this.showCondition())
        {
            this.show();
        }
        else
        {
            this.hide();
        }
    }

    public get text() : string
    {
        return this._text;
    }

    public set text(text : string)
    {
        this._text = text;
        this.textContainer.innerText = text;
    }

    public get subMenu() : ContextMenu
    {
        return this._subMenu;
    }

    public set subMenu(subMenu : ContextMenu)
    {
        this._subMenu = subMenu;

        if (subMenu)
        {
            this.container.classList.add("hasSubMenu");
        }
        else
        {
            this.container.classList.remove("hasSubMenu");
        }
    }

    public hideSubmenu() : void
    {
        if (this.subMenu)
        {
            this.subMenu.hide();
        }
    }

    public hide() : void
    {
        super.hide();
        this.hideSubmenu();
    }
}