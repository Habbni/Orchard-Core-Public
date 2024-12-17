using Microsoft.AspNetCore.Mvc.Filters;
using OrchardCore.DisplayManagement.Layout;
using OrchardCore.DisplayManagement;
using OrchardCore.DisplayManagement.Razor;

namespace Grosshaus.Workflows.Replenish
{
    public class WfResultFilter : IAsyncResultFilter
    {

        private readonly IShapeFactory shapeFactory;
        private readonly ILayoutAccessor layoutAccessor;

        public WfResultFilter(IShapeFactory shapeFactory, ILayoutAccessor layoutAccessor)
        {
            this.shapeFactory = shapeFactory;
            this.layoutAccessor = layoutAccessor;
        }

        public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
        {
            if (context.ActionDescriptor.RouteValues["Controller"] == "WorkflowType" && context.ActionDescriptor.RouteValues["Action"] == "Edit")
            {
                // attach modal dlg shape ONCE for workflow editor
                var layout = await layoutAccessor.GetLayoutAsync();
                var zone = layout.Zones["Content"];

                if (!zone.Items.Any(x => (x as IShape)?.Metadata.Type == "wfModal"))
                {
                    var zoneNew = await zone.AddAsync(await shapeFactory.CreateAsync("wfModal"));
                }
            }
            else if (context.ActionDescriptor.RouteValues["Controller"] == "Activity")
                // remove theme from activity editor to allow for displaying it in modal dlg
                if (context.ActionDescriptor.RouteValues["Action"] == "Edit" || (context.ActionDescriptor.RouteValues["Action"] == "Create"))
                {
                    var razorViewFeature = context.HttpContext.Features.Get<RazorViewFeature>();
                    razorViewFeature.ThemeLayout.Metadata.Type = "wfEmpty"; // alternatively use existing "Layout__Login"
                }

            await next.Invoke();
        }
    }
}
