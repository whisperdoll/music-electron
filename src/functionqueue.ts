export class FunctionQueue
{
    private maxConcurrent : number;
    private currentConcurrent : number = 0;
    private fn : (cb : Function, ...args : any[]) => void;
    private argsQueue : any[][] = [];

    constructor(maxConcurrent : number, fn : (cb : Function, ...args : any[]) => void)
    {
        this.maxConcurrent = maxConcurrent;
        this.fn = fn;
    }

    public queue(...args : any[])
    {
        console.log("queued: " + args.join(", "));
        this.argsQueue.push(args);
        this.invokeNext();
    }

    private invokeNext() : void
    {
        if (this.argsQueue.length > 0 && this.currentConcurrent < this.maxConcurrent)
        {
            this.currentConcurrent++;
            let args = this.argsQueue.pop();

            this.fn(() =>
            {
                this.currentConcurrent--;
                this.invokeNext();
            }, ...args);
        }
    }
}