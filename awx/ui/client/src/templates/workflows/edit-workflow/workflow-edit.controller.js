/*************************************************
 * Copyright (c) 2016 Ansible, Inc.
 *
 * All Rights Reserved
 *************************************************/

 export default
 [   '$scope', '$stateParams', 'WorkflowForm', 'GenerateForm', 'Alert', 'ProcessErrors',
     'ClearScope', 'GetBasePath', '$q', 'ParseTypeChange', 'Wait', 'Empty',
     'ToJSON', 'initSurvey', '$state', 'CreateSelect2', 'ParseVariableString',
     'TemplatesService', 'OrganizationList', 'Rest', 'WorkflowService', 'ToggleNotification',
     function(
         $scope, $stateParams, WorkflowForm, GenerateForm, Alert, ProcessErrors,
         ClearScope, GetBasePath, $q, ParseTypeChange, Wait, Empty,
         ToJSON, SurveyControllerInit, $state, CreateSelect2, ParseVariableString,
         TemplatesService, OrganizationList, Rest, WorkflowService, ToggleNotification
     ) {

        ClearScope();

        $scope.$watch('workflow_job_template_obj.summary_fields.user_capabilities.edit', function(val) {
            if (val === false) {
                $scope.canAddWorkflowJobTemplate = false;
            }
        });

        // Inject dynamic view
        let form = WorkflowForm(),
            generator = GenerateForm,
            id = $stateParams.workflow_job_template_id;

        $scope.mode = 'edit';
        $scope.parseType = 'yaml';
        $scope.includeWorkflowMaker = false;

        function init() {

            // Select2-ify the lables input
            CreateSelect2({
                element:'#workflow_job_template_labels',
                multiple: true,
                addNew: true
            });

            SurveyControllerInit({
                scope: $scope,
                parent_scope: $scope,
                id: id,
                templateType: 'workflow_job_template'
            });

            Rest.setUrl('api/v1/labels');
            Wait("start");
            Rest.get()
                .success(function (data) {
                    $scope.labelOptions = data.results
                        .map((i) => ({label: i.name, value: i.id}));

                    var seeMoreResolve = $q.defer();

                    var getNext = function(data, arr, resolve) {
                        Rest.setUrl(data.next);
                        Rest.get()
                            .success(function (data) {
                                if (data.next) {
                                    getNext(data, arr.concat(data.results), resolve);
                                } else {
                                    resolve.resolve(arr.concat(data.results));
                                }
                            });
                    };

                    Rest.setUrl(GetBasePath('workflow_job_templates') + id +
                         "/labels");
                    Rest.get()
                        .success(function(data) {
                            if (data.next) {
                                getNext(data, data.results, seeMoreResolve);
                            } else {
                                seeMoreResolve.resolve(data.results);
                            }

                            seeMoreResolve.promise.then(function (labels) {
                                $scope.$emit("choicesReady");
                                var opts = labels
                                    .map(i => ({id: i.id + "",
                                        test: i.name}));
                                CreateSelect2({
                                    element:'#workflow_job_template_labels',
                                    multiple: true,
                                    addNew: true,
                                    opts: opts
                                });
                                Wait("stop");
                            });
                        }).error(function(){
                            // job template id is null in this case
                            $scope.$emit("choicesReady");
                        });

                })
                .error(function (data, status) {
                    ProcessErrors($scope, data, status, form, {
                        hdr: 'Error!',
                        msg: 'Failed to get labels. GET returned ' +
                            'status: ' + status
                    });
                });

            // Go out and GET the workflow job temlate data needed to populate the form
            TemplatesService.getWorkflowJobTemplate(id)
            .then(function(data){
                let workflowJobTemplateData = data.data;
                $scope.workflow_job_template_obj = workflowJobTemplateData;
                $scope.name = workflowJobTemplateData.name;
                $scope.can_edit = workflowJobTemplateData.summary_fields.user_capabilities.edit;
                let fld, i;
                for (fld in form.fields) {
                    if (fld !== 'variables' && fld !== 'survey' && workflowJobTemplateData[fld] !== null && workflowJobTemplateData[fld] !== undefined) {
                        if (form.fields[fld].type === 'select') {
                            if ($scope[fld + '_options'] && $scope[fld + '_options'].length > 0) {
                                for (i = 0; i < $scope[fld + '_options'].length; i++) {
                                    if (workflowJobTemplateData[fld] === $scope[fld + '_options'][i].value) {
                                        $scope[fld] = $scope[fld + '_options'][i];
                                    }
                                }
                            } else {
                                $scope[fld] = workflowJobTemplateData[fld];
                            }
                        } else {
                            $scope[fld] = workflowJobTemplateData[fld];
                            if(!Empty(workflowJobTemplateData.summary_fields.survey)) {
                                $scope.survey_exists = true;
                            }
                        }
                    }
                    if (fld === 'variables') {
                        // Parse extra_vars, converting to YAML.
                        $scope.variables = ParseVariableString(workflowJobTemplateData.extra_vars);

                        ParseTypeChange({ scope: $scope, field_id: 'workflow_job_template_variables' });
                    }
                    if (form.fields[fld].type === 'lookup' && workflowJobTemplateData.summary_fields[form.fields[fld].sourceModel]) {
                        $scope[form.fields[fld].sourceModel + '_' + form.fields[fld].sourceField] =
                        workflowJobTemplateData.summary_fields[form.fields[fld].sourceModel][form.fields[fld].sourceField];
                    }
                }
                Wait('stop');
                $scope.url = workflowJobTemplateData.url;
                $scope.survey_enabled = workflowJobTemplateData.survey_enabled;

                let allNodes = [];
                let page = 1;

                let buildTreeFromNodes = function(){
                    $scope.workflowTree = WorkflowService.buildTree({
                        workflowNodes: allNodes
                    });

                    // TODO: I think that the workflow chart directive (and eventually d3) is meddling with
                    // this workflowTree object and removing the children object for some reason (?)
                    // This happens on occasion and I think is a race condition (?)
                    if(!$scope.workflowTree.data.children) {
                        $scope.workflowTree.data.children = [];
                    }

                    $scope.workflowTree.workflow_job_template_obj = $scope.workflow_job_template_obj;

                    // In the partial, the workflow maker directive has an ng-if attribute which is pointed at this scope variable.
                    // It won't get included until this the tree has been built - I'm open to better ways of doing this.
                    $scope.includeWorkflowMaker = true;
                };

                let getNodes = function(){
                    // Get the workflow nodes
                    TemplatesService.getWorkflowJobTemplateNodes(id, page)
                    .then(function(data){
                        for(var i=0; i<data.data.results.length; i++) {
                            allNodes.push(data.data.results[i]);
                        }
                        if(data.data.next) {
                            // Get the next page
                            page++;
                            getNodes();
                        }
                        else {
                            // This is the last page
                            buildTreeFromNodes();
                        }
                    }, function(error){
                        ProcessErrors($scope, error.data, error.status, form, {
                            hdr: 'Error!',
                            msg: 'Failed to get workflow job template nodes. GET returned ' +
                            'status: ' + error.status
                        });
                    });
                };

                getNodes();

            }, function(error){
                ProcessErrors($scope, error.data, error.status, form, {
                    hdr: 'Error!',
                    msg: 'Failed to get workflow job template. GET returned ' +
                'status: ' + error.status
                });
            });
        }

    $scope.openWorkflowMaker = function() {
        $state.go('.workflowMaker');
    };

    $scope.formSave = function () {
        let fld, data = {};
        $scope.invalid_survey = false;

        // Can't have a survey enabled without a survey
        if($scope.survey_enabled === true && $scope.survey_exists!==true){
            $scope.survey_enabled = false;
        }

        generator.clearApiErrors($scope);

        Wait('start');

        try {
                for (fld in form.fields) {
                    data[fld] = $scope[fld];
                }

                data.extra_vars = ToJSON($scope.parseType,
                    $scope.variables, true);

                // We only want to set the survey_enabled flag to
                // true for this job template if a survey exists
                // and it's been enabled.  By default,
                // survey_enabled is explicitly set to true but
                // if no survey is created then we don't want
                // it enabled.
                data.survey_enabled = ($scope.survey_enabled &&
                    $scope.survey_exists) ? $scope.survey_enabled : false;

                // The idea here is that we want to find the new option elements that also have a label that exists in the dom
                $("#workflow_job_template_labels > option").filter("[data-select2-tag=true]").each(function(optionIndex, option) {
                    $("#workflow_job_template_labels").siblings(".select2").first().find(".select2-selection__choice").each(function(labelIndex, label) {
                        if($(option).text() === $(label).attr('title')) {
                            // Mark that the option has a label present so that we can filter by that down below
                            $(option).attr('data-label-is-present', true);
                        }
                    });
                });

                $scope.newLabels = $("#workflow_job_template_labels > option")
                .filter("[data-select2-tag=true]")
                .filter("[data-label-is-present=true]")
                .map((i, val) => ({name: $(val).text()}));

                TemplatesService.updateWorkflowJobTemplate({
                    id: id,
                    data: data
                }).then(function(){

                    var orgDefer = $q.defer();
                    var associationDefer = $q.defer();
                    var associatedLabelsDefer = $q.defer();

                    var getNext = function(data, arr, resolve) {
                        Rest.setUrl(data.next);
                        Rest.get()
                            .success(function (data) {
                                if (data.next) {
                                    getNext(data, arr.concat(data.results), resolve);
                                } else {
                                    resolve.resolve(arr.concat(data.results));
                                }
                            });
                    };

                    Rest.setUrl($scope.workflow_job_template_obj.related.labels);

                    Rest.get()
                        .success(function(data) {
                            if (data.next) {
                                getNext(data, data.results, associatedLabelsDefer);
                            } else {
                                associatedLabelsDefer.resolve(data.results);
                            }
                        });

                    associatedLabelsDefer.promise.then(function (current) {
                        current = current.map(data => data.id);
                        var labelsToAdd = $scope.labels
                            .map(val => val.value);
                        var labelsToDisassociate = current
                            .filter(val => labelsToAdd
                                .indexOf(val) === -1)
                            .map(val => ({id: val, disassociate: true}));
                        var labelsToAssociate = labelsToAdd
                            .filter(val => current
                                .indexOf(val) === -1)
                            .map(val => ({id: val, associate: true}));
                        var pass = labelsToDisassociate
                            .concat(labelsToAssociate);
                        associationDefer.resolve(pass);
                    });

                    Rest.setUrl(GetBasePath("organizations"));
                    Rest.get()
                        .success(function(data) {
                            orgDefer.resolve(data.results[0].id);
                        });

                    orgDefer.promise.then(function(orgId) {
                        var toPost = [];
                        $scope.newLabels = $scope.newLabels
                            .map(function(i, val) {
                                val.organization = orgId;
                                return val;
                            });

                        $scope.newLabels.each(function(i, val) {
                            toPost.push(val);
                        });

                        associationDefer.promise.then(function(arr) {
                            toPost = toPost
                                .concat(arr);

                            Rest.setUrl($scope.workflow_job_template_obj.related.labels);

                            var defers = [];
                            for (var i = 0; i < toPost.length; i++) {
                                defers.push(Rest.post(toPost[i]));
                            }
                            $q.all(defers)
                                .then(function() {
                                    $state.go('templates.editWorkflowJobTemplate', {id: id}, {reload: true});
                                });
                        });
                    });

                }, function(error){
                    ProcessErrors($scope, error.data, error.status, form, {
                        hdr: 'Error!',
                        msg: 'Failed to update workflow job template. PUT returned ' +
                        'status: ' + error.status
                    });
                });

            } catch (err) {
                Wait('stop');
                Alert("Error", "Error saving workflow job template. " +
                "Parser returned: " + err);
            }
        };

        $scope.formCancel = function () {
            $state.transitionTo('templates');
        };

        $scope.toggleNotification = function(event, notifier_id, column) {
            var notifier = this.notification;
            try {
                $(event.target).tooltip('hide');
            }
            catch(e) {
                // ignore
            }
            ToggleNotification({
                scope: $scope,
                url: GetBasePath('workflow_job_templates') + id,
                notifier: notifier,
                column: column,
                callback: 'NotificationRefresh'
            });
        };

        if ($scope.removeSurveySaved) {
            $scope.removeSurveySaved();
        }
        $scope.removeSurveySaved = $scope.$on('SurveySaved', function() {
            Wait('stop');
            $scope.survey_exists = true;
            $scope.invalid_survey = false;
        });

        init();
    }
];
