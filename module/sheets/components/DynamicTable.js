import ExtensibleTable from './ExtensibleTable.js';

/**
 * DynamicTable component
 * @ignore
 */
class DynamicTable extends ExtensibleTable {
    /**
     * Constructor
     * @param {Object} data Component data
     * @param {string} data.key Component key
     * @param {string|null} [data.tooltip] Component tooltip
     * @param {string} data.templateAddress Component address in template, i.e. component path from actor.system object
     * @param {boolean} [data.head=false] Table head should be bold ?
     * @param {Array<Component>} [data.contents=[]] Container contents
     * @param {Object} [data.rowLayout={}] Dynamic table row layout
     * @param {string|null} [data.cssClass=null] Additional CSS class to apply at render
     * @param {Number} [data.role=0] Component minimum role
     * @param {Number} [data.permission=0] Component minimum permission
     * @param {string|null} [data.visibilityFormula=null] Component visibility formula
     * @param {Container|null} [data.parent=null] Component's container
     */
    constructor({
        key,
        tooltip = null,
        templateAddress,
        head = false,
        contents = [],
        rowLayout = {},
        deleteWarning = false,
        cssClass = null,
        role = 0,
        permission = 0,
        visibilityFormula = null,
        parent = null
    }) {
        super({
            key: key,
            tooltip: tooltip,
            templateAddress: templateAddress,
            contents: contents,
            cssClass: cssClass,
            head: head,
            rowLayout: rowLayout,
            deleteWarning: deleteWarning,
            role: role,
            permission: permission,
            visibilityFormula: visibilityFormula,
            parent: parent
        });
    }

    /**
     * Renders component
     * @override
     * @param {CustomActor} actor
     * @param {boolean} [isEditable=true] Is the component editable by the current user ?
     * @return {Promise<JQuery<HTMLElement>>} The jQuery element holding the component
     */
    async _getElement(actor, isEditable = true, options) {
        let sampleNewRow = { deleted: false };

        let baseElement = await super._getElement(actor, isEditable, options);

        let jQElement = $('<table></table>');

        let tableBody = $('<tbody></tbody>');
        let firstRow = $('<tr></tr>');

        for (let component of this._contents) {
            let cell = $('<td></td>');

            cell.addClass('custom-system-cell');

            switch (this._rowLayout[component.key].align) {
                case 'center':
                    cell.addClass('custom-system-cell-alignCenter');
                    break;
                case 'right':
                    cell.addClass('custom-system-cell-alignRight');
                    break;
                case 'left':
                default:
                    cell.addClass('custom-system-cell-alignLeft');
                    break;
            }

            if (this._head) {
                cell.addClass('custom-system-cell-boldTitle');
            }

            if (actor.isTemplate) {
                let sortLeftTabButton = $('<a><i class="fas fa-caret-left custom-system-clickable"></i></a>');
                sortLeftTabButton.addClass('item');
                sortLeftTabButton.attr('title', 'Sort component to the left');

                sortLeftTabButton.on('click', () => {
                    component.sortBeforeInParent(actor);
                });

                cell.append(sortLeftTabButton);
            }

            const colNameSpan = $('<span></span>');
            colNameSpan.append(this._rowLayout[component.key].colName);

            sampleNewRow[component.key] = component?.defaultValue ?? null;

            if (actor.isTemplate) {
                colNameSpan.addClass('custom-system-editable-component');
                colNameSpan.append(' {' + component.key + '}');
                colNameSpan.on('click', () => {
                    component.editComponent(actor, this._rowLayout[component.key]);
                });
            }

            cell.append(colNameSpan);

            if (actor.isTemplate) {
                let sortRightTabButton = $('<a><i class="fas fa-caret-right custom-system-clickable"></i></a>');
                sortRightTabButton.addClass('item');
                sortRightTabButton.attr('title', 'Sort component to the right');

                sortRightTabButton.on('click', () => {
                    component.sortAfterInParent(actor);
                });

                cell.append(sortRightTabButton);
            }

            firstRow.append(cell);
        }

        let headControlsRow = $('<td></td>');

        if (actor.isTemplate) {
            headControlsRow.addClass('custom-system-cell custom-system-cell-alignRight');
            headControlsRow.append(
                await this.renderTemplateControls(actor, {
                    isDynamicTable: true
                })
            );
        }

        firstRow.append(headControlsRow);
        tableBody.append(firstRow);

        if (!actor.isTemplate) {
            let relevantRows = [];
            let dynamicProps = foundry.utils.getProperty(actor.system.props, this.key);
            for (let rowIndex in dynamicProps) {
                if (dynamicProps.hasOwnProperty(rowIndex) && !dynamicProps[rowIndex]?.deleted) {
                    relevantRows.push(parseInt(rowIndex));
                }
            }
            relevantRows = relevantRows.sort(function (a, b) {
                return a - b;
            });

            for (let [index, line] of relevantRows.entries()) {
                let tableRow = $('<tr></tr>');
                tableRow.addClass('custom-system-dynamicRow');

                for (let component of this.contents) {
                    let cell = $('<td></td>');
                    cell.addClass('custom-system-cell');

                    switch (this._rowLayout[component.key].align) {
                        case 'center':
                            cell.addClass('custom-system-cell-alignCenter');
                            break;
                        case 'right':
                            cell.addClass('custom-system-cell-alignRight');
                            break;
                        case 'left':
                        default:
                            cell.addClass('custom-system-cell-alignLeft');
                            break;
                    }

                    let newCompJson = component.toJSON();
                    newCompJson.key = `${this.key}.${line}.${component.key}`;

                    cell.append(await componentFactory.createComponents(newCompJson).render(actor, isEditable));

                    tableRow.append(cell);
                }

                let controlCell = $('<td></td>');
                let controlDiv = $('<div></div>');
                controlDiv.addClass('custom-system-dynamic-table-row-icons');

                let sortSpan = $('<span></span>');
                sortSpan.addClass('custom-system-dynamic-table-sort-icon-wrapper');

                if (isEditable && line !== relevantRows[0]) {
                    let sortUpLink = $(
                        '<a><i class="fas fa-sort-up custom-system-dynamic-table-sort-icon custom-system-sortUpDynamicLine custom-system-clickable"></i></a>'
                    );
                    sortSpan.append(sortUpLink);

                    sortUpLink.on('click', () => {
                        if (index !== 0) {
                            this._swapElements(actor, relevantRows[index - 1], relevantRows[index]);
                        }
                    });
                }

                if (isEditable && line !== relevantRows[relevantRows.length - 1]) {
                    let sortDownLink = $(
                        '<a><i class="fas fa-sort-down custom-system-dynamic-table-sort-icon custom-system-sortDownDynamicLine custom-system-clickable"></i></a>'
                    );
                    sortSpan.append(sortDownLink);

                    sortDownLink.on('click', () => {
                        if (index !== relevantRows.length - 1) {
                            this._swapElements(actor, relevantRows[index + 1], relevantRows[index]);
                        }
                    });
                }

                controlDiv.append(sortSpan);
                if (isEditable) {
                    let deleteLink = $(
                        '<a><i class="fas fa-trash custom-system-deleteDynamicLine custom-system-clickable"></i></a>'
                    );
                    if (this._deleteWarning) {
                        deleteLink.on('click', () => {
                            Dialog.confirm({
                                title: 'Delete row',
                                content: '<p>Are you sure you want to delete this row ?</p>',
                                yes: () => {
                                    this._deleteRow(actor, line);
                                },
                                no: () => {}
                            });
                        });
                    } else {
                        deleteLink.on('click', () => {
                            this._deleteRow(actor, line);
                        });
                    }
                    controlDiv.append(deleteLink);
                }
                controlCell.append(controlDiv);

                tableRow.append(controlCell);
                tableBody.append(tableRow);
            }

            if (isEditable) {
                let addRow = $('<tr></tr>');
                let fillCell = $('<td></td>');
                fillCell.attr('colspan', this.contents.length);

                let addButtonCell = $('<td></td>');
                let addButton = $(
                    '<a><i class="fas fa-plus-circle custom-system-addDynamicLine custom-system-clickable"></i></a>'
                );
                addButton.on('click', () => {
                    let tableProps = foundry.utils.getProperty(actor.system.props, this.key) ?? {};
                    let newIndex = relevantRows.length ? parseInt(relevantRows[relevantRows.length - 1]) + 1 : 0;

                    tableProps[newIndex] = { ...sampleNewRow };
                    foundry.utils.setProperty(actor.system.props, this.key, tableProps);

                    actor.update({
                        system: {
                            props: actor.system.props
                        }
                    });
                });

                addButtonCell.append(addButton);

                addRow.append(fillCell);
                addRow.append(addButtonCell);
                tableBody.append(addRow);
            }
        }

        jQElement.append(tableBody);
        baseElement.append(jQElement);
        return baseElement;
    }

    /**
     * Returns serialized component
     * @override
     * @return {Object}
     */
    toJSON() {
        let jsonObj = super.toJSON();

        return {
            ...jsonObj,
            type: 'dynamicTable'
        };
    }

    /**
     * Creates DynamicTable from JSON description
     * @override
     * @param {Object} json
     * @param {string} templateAddress
     * @param {Container|null} parent
     * @return {DynamicTable}
     */
    static fromJSON(json, templateAddress, parent = null) {
        let rowContents = [];
        let rowLayout = {};

        let dynamicTable = new DynamicTable({
            key: json.key,
            tooltip: json.tooltip,
            templateAddress: templateAddress,
            head: json.head,
            deleteWarning: json.deleteWarning,
            contents: rowContents,
            rowLayout: rowLayout,
            cssClass: json.cssClass,
            role: json.role,
            permission: json.permission,
            visibilityFormula: json.visibilityFormula,
            parent: parent
        });

        for (let [index, componentDesc] of (json.rowLayout ?? []).entries()) {
            let component = componentFactory.createComponents(
                componentDesc,
                templateAddress + '.rowLayout.' + index,
                dynamicTable
            );
            rowContents.push(component);
            rowLayout[component.key] = {
                align: componentDesc.align,
                colName: componentDesc.colName
            };
        }

        return dynamicTable;
    }

    /**
     * Gets pretty name for this component's type
     * @return {string} The pretty name
     * @throws {Error} If not implemented
     */
    static getPrettyName() {
        return 'Dynamic Table';
    }

    /**
     * Get configuration form for component creation / edition
     * @return {Promise<JQuery<HTMLElement>>} The jQuery element holding the component
     */
    static async getConfigForm(existingComponent) {
        let mainElt = $('<div></div>');

        mainElt.append(
            await renderTemplate(
                'systems/custom-system-builder/templates/_template/components/dynamicTable.html',
                existingComponent
            )
        );

        return mainElt;
    }

    /**
     * Extracts configuration from submitted HTML form
     * @override
     * @param {JQuery<HTMLElement>} html The submitted form
     * @return {Object} The JSON representation of the component
     * @throws {Error} If configuration is not correct
     */
    static extractConfig(html) {
        let fieldData = super.extractConfig(html);

        if (!fieldData.key) {
            throw new Error('Component key is mandatory for ' + this.getPrettyName());
        }

        return fieldData;
    }
}

/**
 * @ignore
 */
export default DynamicTable;
