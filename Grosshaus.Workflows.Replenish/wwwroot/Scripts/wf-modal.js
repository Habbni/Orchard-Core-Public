var $canvas;
var workflowType;
var workflowEditor;
var $iframe = $("#wf-iframe");

$(document).ready(function () {

    $canvas = $('.workflow-canvas');
    workflowType = $canvas.data('workflow-type');
    workflowEditor = $canvas.data('workflowEditor');   

    // defer tooltips, dont attach them before oc has initialized jsPlumpInstance:
    var tooltipTimer = setInterval(() => {
        if (workflowEditor.jsPlumbInstance != null) {            
            attachTooltips();
            clearInterval(tooltipTimer);
        }        
    }, 50);       

    $canvas.off('dblclick', '.activity').on('dblclick', '.activity', e => {
        e.preventDefault();
        showModal($(e.currentTarget).find('.activity-edit-action').attr("href"));
    });

    docLoaded = true;
});

// new modal dialog button handlers:

$(document).on('click', "#btn-close-wf-edit-modal", function (e) {
    var $modal = $("#wf-edit-modal");
    $modal.modal('hide');
});

$(document).on('click', "#btn-save-wf-edit-modal", function (e) {
    
    var $form = $("#wf-iframe").contents().find("form");
    var actionUrl = $form.attr('action');
    const activityId = $form.find('input[type="hidden"][name="ActivityId"]').val();

    $.ajax({
        type: "POST",
        url: actionUrl,
        data: $form.serialize(),
        success: function (dataResult) {

            const parser = new DOMParser();
            const docResult = parser.parseFromString(dataResult, 'text/html');

            let hasValidationErrors = docResult.querySelector('form .has-validation-error, form.is-invalid');

            if (hasValidationErrors) {
                const iframeDoc = $iframe[0].contentDocument || $iframe[0].contentWindow.document;
                const $iframeBody = $(iframeDoc.body);

                const $newForms = $(docResult).find('form').clone(true);
                $iframeBody.find('form').remove();
                $iframeBody.append($newForms);
                removeActionButtons();
            }
            else {
                // validation okay, trigger iframeSubmitted-event in parent document for further processing:
                var w = window;
                w.parent.jQuery(w.parent.document).trigger('iframeSubmitted', [dataResult, activityId, actionUrl, docResult]);
            }

        }
    })
});

$(document).on('iframeSubmitted', function (e, data, activityId, actionUrl, doc) {
     //iframe ajax form post triggered this, replace activity or reload page depending on add or edit
    let isAdding = actionUrl.includes("/Add?");

    const targetId = `activity-${workflowType.id}-${activityId}`;

    const newElement = doc.querySelector(`#${targetId}`);
    if (isAdding) {
        // could append to canvas and init new items here, but page reload with localState is simpler solution
        // and does not disturb the flow too much:
        reloadWithLocalId();
    }
    else {
        // activiy has been edited, extract elements from result by activityId and update document:
        const result = doc.querySelector(`#${targetId}`);
        if (result) {
            if (newElement) {
                const existingElement = document.getElementById(targetId);
                if (existingElement) {
                    existingElement.innerHTML = newElement.innerHTML;
                }
            }
        }
        updateActivityOutcomes(doc, targetId, activityId);    
    }

    var $modal = $("#wf-edit-modal");
    $modal.modal('hide');
}); 


function updateActivityOutcomes(doc, targetId, activityId) {
    var activityElement = doc.querySelector(`#${targetId}`);
    var activity = workflowEditor.getActivity(activityId);

    const $resultCanvas = $(doc.querySelector(".workflow-canvas"));
    var resultData = $resultCanvas.data("workflow-type");

    const activityToUpdateFrom = resultData.activities.find(a => a.id === activity.id);

    if (hasOutcomesChanged(activity, activityToUpdateFrom)) {

        activity.outcomes = activityToUpdateFrom.outcomes;

        // TODO: removal of all connections when outcomes change is good for now, but either display a warning or
        //       implement selective removal/updating to avoid the issue:
        workflowEditor.jsPlumbInstance.removeAllEndpoints(activityElement);
        activityToUpdateFrom.outcomes.forEach(outcome => {
            const sourceEndpointOptions = workflowEditor.getSourceEndpointOptions(activity, outcome);
            workflowEditor.jsPlumbInstance.addEndpoint(activityElement, { connectorOverlays: [['Label', { label: outcome.displayName, cssClass: 'connection-label' }]] }, sourceEndpointOptions);
        });

        workflowEditor.jsPlumbInstance.repaint(activityElement);

        attachTooltipToEndpoints(workflowEditor.jsPlumbInstance.getEndpoints(activityElement));
        $(".jtk-endpoint").tooltip();
    }
}

function hasOutcomesChanged(activity, activityToUpdateFrom) {
    if (!activity || !activity.outcomes || !activityToUpdateFrom || !activityToUpdateFrom.outcomes) {        
        return false;
    }
    if (activity.outcomes.length !== activityToUpdateFrom.outcomes.length) {
        return true;
    }    
    for (let i = 0; i < activity.outcomes.length; i++) {
        const outcome = activity.outcomes[i];
        const updatedOutcome = activityToUpdateFrom.outcomes[i];

        if (outcome.name !== updatedOutcome.name || outcome.displayName !== updatedOutcome.displayName) {
            return true;
        }
    }
    return false;
}

function attachTooltips() {
    var activityElements = workflowEditor.getActivityElements();
    activityElements.each((_, item) => {
        let endpoints = workflowEditor.jsPlumbInstance.getEndpoints(item);
        attachTooltipToEndpoints(endpoints);
    }); 
    $(".jtk-endpoint").tooltip();
}
function attachTooltipToEndpoints(endpoints) {
    for (let i = 0; i < endpoints.length; i++) {
        let ep = endpoints[i];
        if (ep.connectorOverlays != null) {
            var label = ep.connectorOverlays[0][1].label;
            $(ep.canvas).attr('data-bs-toggle', 'tooltip');
            $(ep.canvas).attr('title', label);
        }
    }    
}

function reloadWithLocalId() {
    // reload the whole site, but add localId to queryString as this triggers localState reload
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    if (!params.has('localId')) {
        params.append('localId', workflowEditor.localId);
        url.search = params.toString();        
    }

    window.location.href = url.href;
}

function removeActionButtons() {
    const $iframeDoc = $($iframe[0].contentDocument || $iframe[0].contentWindow.document);
    const $saveButton = $iframeDoc.find('.save');

    if ($saveButton.length > 0) {
        const $parent = $saveButton.parent();
        if ($parent.length > 0) {
            $parent.remove();
        }
    }
}

$iframe.on('load', function () {
    removeActionButtons();
    toggleSpinner(false);

    // check if result is activity editor by inspecting body:
    const iframeDoc = $iframe[0].contentDocument || $iframe[0].contentWindow.document;
    const $div = $(iframeDoc).find('body > div[data-workflow-type-id][data-activity-id]');

    // show iframe if yes, close/reload otherwise because it´s some parameterless activity:
    if ($div.length > 0)
        $iframe.show();
    else
        reloadWithLocalId();
});

$("#activity-picker a[data-persist-workflow]").on('click', function (e) {
    e.preventDefault();
    let href = $(e.currentTarget).attr("href");
    showModal(href);

    var $modal = $("#activity-picker");
    $modal.modal('hide');
});

$(".workflow-canvas-container .activity").on("shown.bs.popover", function (e) {
    // oc popover clones .activity-commands, losing all events. utilize popper.shown event to get later into the pipeline
    $(".activity-edit-action").off('click').on('click', function (e2) {        
        e2.preventDefault();
        showModal($(e2.currentTarget).attr("href"));
    });
});

function showModal(href, title = "Edit") {    
    let activityElements = $('.workflow-canvas-container .activity');
    activityElements.popover('hide');    

    $iframe.hide();
    toggleSpinner(true);
    var $modal = $("#wf-edit-modal");

    $modal.find('#wf-iframe').attr('src', href);
    $modal.modal('show');
}

function toggleSpinner(state) {
    $('.fa-spinner').toggle(state);
}