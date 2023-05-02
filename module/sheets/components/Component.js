import templateFunctions from '../template-functions.js';
import Formula from '../../formulas/Formula.js';
import { CustomItem } from '../../documents/item.js';

/**
 * Abstract component class
 * @abstract
 */
class Component {
    /**
     * Component key
     * @type {string}
     * @private
     */
    _key;

    /**
     * Component address in template definition
     * @type {string}
     * @private
     */
    _templateAddress;

    /**
     * Component css class
     * @type {string|null}
     * @private
     */
    _cssClass;

    /**
     * Component minimum role
     * @type {Number}
     * @private
     */
    _role;

    /**
     * Component minimum permission
     * @type {Number}
     * @private
     */
    _permission;

    /**
     * Component tooltip
     * @type {string|null}
     * @private
     */
    _tooltip;

    /**
     * Component visibility formula
     * @type {string|null}
     * @private
     */
    _visibilityFormula;

    /**
     * Composant parent
     * @type {Container}
     * @private
     */
    _parent;

    static addWrapperOnTemplate = false;

    /**
     * Component constructor
     * @constructor
     * @param {Object} data Component data
     * @param {string} data.key Component key
     * @param {string} data.templateAddress Component address in template, i.e. component path from actor.system object
     * @param {string|null} [data.cssClass=null] Additional CSS class to apply at render
     * @param {Number} [data.role=0] Component minimum role
     * @param {Number} [data.permission=0] Component minimum permission
     * @param {string|null} [data.tooltip=null] Component tooltip
     * @param {string|null} [data.visibilityFormula=null] Component visibility formula
     * @param {Container|null} [data.parent=null] Component's container
     */
    constructor({
        key,
        templateAddress,
        cssClass = null,
        role = 0,
        permission = 0,
        tooltip = null,
        visibilityFormula = null,
        parent = null
    }) {
        if (this.constructor === Component) {
            throw new TypeError('Abstract class "Component" cannot be instantiated directly');
        }
        this._key = key;
        this._templateAddress = templateAddress;
        this._cssClass = cssClass;
        this._role = role;
        this._permission = permission;
        this._tooltip = tooltip;
        this._visibilityFormula = visibilityFormula;
        this._parent = parent;
    }

    /**
     * Component key
     * @return {string}
     */
    get key() {
        return this._key;
    }

    /**
     * Component tooltip
     * @return {string}
     */
    get tooltip() {
        return this._tooltip;
    }

    /**
     * Component address in template, i.e. component path from actor.system object
     * @return {string}
     */
    get templateAddress() {
        return this._templateAddress;
    }

    /**
     * Additional CSS class
     * @return {string|null}
     */
    get cssClass() {
        return this._cssClass;
    }

    /**
     * Component minimum role
     * @return {Number}
     */
    get role() {
        return this._role;
    }

    /**
     * Component minimum permission
     * @return {Number}
     */
    get permission() {
        return this._permission;
    }

    /**
     * Component raw visibility formula
     * @returns {string|null}
     */
    get visibilityFormula() {
        return this._visibilityFormula;
    }

    /**
     * Component should have header on template mode
     * @returns {boolean}
     */
    get addWrapperOnTemplate() {
        return this.constructor.addWrapperOnTemplate;
    }

    /**
     * Returns component's parent
     * @returns {Container}
     */
    get parent() {
        return this._parent;
    }

    /**
     * Check if component can be rendered for the current user
     * @param actor
     * @returns {boolean}
     */
    canBeRendered(actor) {
        if (actor.isTemplate) {
            return true;
        }

        let canRender = game.user.role >= this.role && actor.permission >= this.permission;

        if (this.visibilityFormula) {
            let formula = new Formula(this.visibilityFormula);

            try {
                let formulaRef = this.key ? this.key.split('.').slice(0, -1).join('.') : null;
                let formulaProps = actor.system?.props ?? {};

                formula.computeStatic(formulaProps, {
                    reference: formulaRef
                });

                canRender = !!formula.result; // Cast to boolean
            } catch (e) {
                canRender = false;
            }
        }

        return canRender;
    }

    /**
     * @param {CustomActor} actor Rendered actor
     * @param {boolean} [isEditable=true] Is the component editable by the current user ?
     * @param {Object} [options={}] Additional options usable by the final Component
     * @return {Promise<JQuery<HTMLElement>>} The jQuery element holding the component
     */
    async render(actor, isEditable = true, options = {}) {
        if (this.canBeRendered(actor)) {
            return this._getElement(actor, isEditable, options);
        } else {
            return $('<div></div>');
        }
    }

    /**
     * @abstract
     * @param {CustomActor} actor Rendered actor
     * @param {boolean} [isEditable=true] Is the component editable by the current user ?
     * @param {Object} [options={}] Additional options usable by the final Component
     * @return {Promise<JQuery<HTMLElement>>} The jQuery element holding the component
     */
    async _getElement(actor, isEditable = true, options = {}) {
        let jQElement = $('<div></div>');
        jQElement.addClass('custom-system-component-contents');
        jQElement.addClass(this.key);
        jQElement.addClass(this.cssClass);

        if (this.tooltip) {
            jQElement.attr('title', this.tooltip);
        }

        if (actor.isTemplate) {
            if (this.templateAddress !== 'body' && this.templateAddress !== 'header') {
                let dragHandle = jQElement;

                if (this.addWrapperOnTemplate) {
                    let templateWrapper = $('<div></div>');
                    templateWrapper.addClass('custom-system-editable-panel');
                    templateWrapper.addClass(this.cssClass);

                    let panelTitle = $('<div></div>');
                    panelTitle.addClass('custom-system-editable-panel-title custom-system-editable-component');
                    panelTitle.text(this.constructor.getPrettyName() + ' ' + this.key);

                    panelTitle.on('click', () => {
                        this.editComponent(actor);
                    });

                    templateWrapper.append(panelTitle);
                    templateWrapper.append(jQElement);

                    jQElement = templateWrapper;
                    dragHandle = panelTitle;
                }

                dragHandle.attr('draggable', 'true');
                dragHandle.on('dragstart', (ev) => {
                    ev.originalEvent.stopPropagation();

                    ev.originalEvent.dataTransfer.effectAllowed = 'copyMove';
                    ev.originalEvent.dataTransfer.dropEffect = 'move';

                    game.system.flags.copiedComponent = {
                        sourceId: actor.uuid,
                        component: this
                    };

                    setTimeout(() => {
                        jQElement.hide();
                    }, 0);
                });
                dragHandle.on('dragend', () => {
                    $('.custom-system-drop-target').remove();
                    actor.sheet.render(false);
                });

                if (this.parent.droppable) {
                    dragHandle.on('dragover', (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();

                        let sourceId = game.system.flags?.copiedComponent?.sourceId;

                        if (ev.ctrlKey || sourceId !== actor.uuid) {
                            ev.originalEvent.dataTransfer.dropEffect = 'copy';
                        } else {
                            ev.originalEvent.dataTransfer.dropEffect = 'move';
                        }
                    });

                    dragHandle.on('dragenter', (ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();

                        $('.custom-system-drop-target').remove();

                        let dropTarget = $('<div>Insert here</div>');
                        dropTarget.addClass('custom-system-drop-target');

                        dropTarget.on('dragover', (ev) => {
                            ev.stopPropagation();
                            ev.preventDefault();

                            let sourceId = game.system.flags?.copiedComponent?.sourceId;

                            if (ev.ctrlKey || sourceId !== actor.uuid) {
                                ev.originalEvent.dataTransfer.dropEffect = 'copy';
                            } else {
                                ev.originalEvent.dataTransfer.dropEffect = 'move';
                            }
                        });

                        dropTarget.on('dragleave', () => {
                            $('.custom-system-drop-target').remove();
                        });
                        dropTarget.on('drop', (event) => {
                            this.dropOnComponent(actor, event, this.parent, {
                                insertBefore: this
                            });
                        });

                        dropTarget.insertBefore(jQElement);
                    });

                    dragHandle.on('drop', (event) => {
                        this.dropOnComponent(actor, event, this.parent, {
                            insertBefore: this
                        });
                    });
                }
            }
        }

        jQElement.addClass('custom-system-component-root');
        return jQElement;
    }

    /**
     * Handles component editor dialog
     * @param {CustomActor} actor Current template
     * @param {Object|null} [dynamicTableAttributes=null]
     * @param {string} dynamicTableAttributes.align
     * @param {string} dynamicTableAttributes.colName
     * @param {Array<String>|null} allowedComponents Allowed component types
     */
    editComponent(actor, dynamicTableAttributes = null, allowedComponents = null) {
        let componentJSON = this.toJSON();
        if (dynamicTableAttributes) {
            componentJSON = foundry.utils.mergeObject(componentJSON, dynamicTableAttributes);
        }

        // Open dialog to edit component
        templateFunctions.component(
            (action, component) => {
                // This is called on dialog validation

                // Dialog has many buttons, clicked button is returned in action
                // New component data is returns in component

                // If we edit the component
                if (action === 'edit') {
                    this.edit(actor, component, dynamicTableAttributes !== null);
                } else if (action === 'delete') {
                    this.delete(actor);
                }
            },
            {
                componentData: componentJSON,
                allowedComponents,
                isDynamicTable: dynamicTableAttributes !== null,
                actor
            }
        );
    }

    /**
     * Saves component in database
     * @param {CustomActor} actor Current template
     */
    async save(actor) {
        await actor.sheet.saveTemplate();
    }

    /**
     * Edits component
     * @param {CustomActor} actor Current template
     * @param {Object} data Diff data
     * @param {boolean} isDynamicTable Is the popup called from a dynamic table ?
     */
    async edit(actor, data, isDynamicTable) {
        let newComponent = foundry.utils.mergeObject(this.toJSON(), data);

        this.parent.replaceComponent(actor, this, newComponent);

        // After actions have been taken care of, save actor
        await this.save(actor);
    }

    /**
     * Deletes component
     * @param {CustomActor} actor Current template
     * @param {boolean} triggerSave Save the template after deleting component. Defaults to true.
     */
    async delete(actor, triggerSave = true) {
        this.parent.deleteComponent(actor, this);
        if (triggerSave) {
            await this.save(actor);
        }
    }

    /**
     * Sort after in the same container
     * @param {CustomActor} actor Current template
     */
    async sortAfterInParent(actor) {
        this.parent.sortComponentAfter(actor, this);

        // After actions have been taken care of, save actor
        await this.save(actor);
    }

    /**
     * Sort before in the same container
     * @param {CustomActor} actor Current template
     */
    async sortBeforeInParent(actor) {
        this.parent.sortComponentBefore(actor, this);

        // After actions have been taken care of, save actor
        await this.save(actor);
    }

    /**
     * Handles components and subtemplates drops on a component
     * @param {CustomActor} actor
     * @param {DragEvent} event
     * @param {Container} insertionTarget
     * @param {Object} insertionOptions
     * @returns {Promise<void>}
     */
    async dropOnComponent(actor, event, insertionTarget, insertionOptions) {
        event.stopPropagation();
        event.preventDefault();

        let dropData;

        try {
            dropData = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
        } catch (e) {}

        if (dropData) {
            try {
                let item = await CustomItem.fromDropData(dropData);
                if (item && item.type === 'subTemplate') {
                    try {
                        await insertionTarget.addNewComponent(actor, item.system.body.contents, insertionOptions);
                    } catch (e) {
                        ui.notifications.error(e.message);
                    }
                } else {
                    ui.notifications.error('Only subtemplates items can be dragged on templates');
                }
            } catch (e) {}
        }

        const droppedData = game.system.flags.copiedComponent;
        const sourceId = droppedData?.sourceId;
        const droppedComponent = droppedData?.component;

        if (droppedComponent) {
            if (sourceId === actor.uuid && !event.ctrlKey) {
                await droppedComponent.delete(actor, false);
            }

            try {
                await insertionTarget.addNewComponent(actor, droppedComponent.toJSON(), insertionOptions);
                game.system.flags.copiedComponent = null;
            } catch (e) {
                ui.notifications.error(e.message);
            }
        }
    }

    /**
     * Returns serialized component
     * @return {Object}
     */
    toJSON() {
        return {
            key: this.key,
            cssClass: this.cssClass,
            role: this.role,
            permission: this.permission,
            tooltip: this.tooltip,
            visibilityFormula: this.visibilityFormula
        };
    }

    /**
     * Creates a new component from a JSON description
     * @abstract
     * @param {Object} json Component description
     * @param {string} templateAddress Component address in template, i.e. component path from actor.system object
     * @param {Container} [parent=null] Component's parent
     * @return Component The new component
     * @throws {Error} If not implemented
     */
    static fromJSON(json, templateAddress, parent = null) {
        throw new Error('You must implement this function');
    }

    /**
     * Gets pretty name for this component's type
     * @abstract
     * @return {string} The pretty name
     * @throws {Error} If not implemented
     */
    static getPrettyName() {
        throw new Error('You must implement this function');
    }

    /**
     * Get configuration form for component creation / edition
     * @abstract
     * @param {Object} existingComponent Basic description of the existing component to pre-fill the form
     * @return {Promise<JQuery<HTMLElement>>} The jQuery element holding the component
     * @throws {Error} If not implemented
     */
    static async getConfigForm(existingComponent) {
        throw new Error('You must implement this function');
    }

    /**
     * Extracts configuration from submitted HTML form
     * @abstract
     * @param {JQuery<HTMLElement>} html The submitted form
     * @return {Object} The basic representation of the component
     * @throws {Error} If configuration is not correct
     */
    static extractConfig(html) {
        let fieldData = {};

        // Fetch fields existing for every type of components
        let genericFields = html.find(
            '.custom-system-component-generic-fields input, .custom-system-component-generic-fields select, .custom-system-component-generic-fields textarea'
        );

        // Store their value in an object
        for (let field of genericFields) {
            let jQField = $(field);
            fieldData[jQField.data('key')] = jQField.val();
        }

        if (fieldData.key && !fieldData.key.match(/^[a-zA-Z0-9_]+$/)) {
            throw new Error(
                'Component key must be a string composed of upper and lowercase letters and underscores only.'
            );
        }

        return fieldData;
    }
}

/**
 * @ignore
 */
export default Component;
