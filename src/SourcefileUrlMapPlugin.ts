import * as Path from 'path'
import * as FS from 'fs-extra'
// @ts-ignore
import * as branch from "node-current-branch";
import {Component} from 'typedoc/dist/lib/utils/component'
import {ConverterComponent} from 'typedoc/dist/lib/converter/components'
import {Converter} from 'typedoc/dist/lib/converter/converter'
import {Context} from 'typedoc/dist/lib/converter/context'
import {Options} from 'typedoc/dist/lib/utils/options/options'

interface Mapping {
    pattern: RegExp,
    replace: string,
    onlyTitle: boolean;
}

@Component({name: 'sourcefile-url'})
export class SourcefileUrlMapPlugin extends ConverterComponent {

    private mappings: Mapping[] | undefined;
    private branchName: string;

    public initialize(): void {
        this.listenTo(this.owner, Converter.EVENT_BEGIN, this.onBegin)
    }

    private onBegin(): void {
        if (branch) {
            this.branchName = branch();
        } else {
            console.info('typedoc-plugin-sourcefile-url: node-current-branch not installed.')
        }
        // read options parameter
        const options: Options = this.application.options
        const mapRelativePath = options.getValue('sourcefile-url-map')
        const urlPrefix = options.getValue('sourcefile-url-prefix')

        if ((typeof mapRelativePath !== 'string') && (typeof urlPrefix !== 'string')) {
            return
        }

        try {
            if ((typeof mapRelativePath === 'string') && (typeof urlPrefix === 'string')) {
                throw new Error('use either --sourcefile-url-prefix or --sourcefile-url-map option')
            }

            if (typeof mapRelativePath === 'string') {
                this.readMappingJson(mapRelativePath)
            } else if (typeof urlPrefix === 'string') {
                this.mappings = [{
                    pattern: new RegExp('^'),
                    replace: urlPrefix,
                    onlyTitle: false
                }]
            }

            // register handler
            this.listenTo(this.owner, Converter.EVENT_RESOLVE_END, this.onEndResolve)
        } catch (e) {
            console.error('typedoc-plugin-sourcefile-url: ' + e.message)
        }
    }

    private readMappingJson(mapRelativePath: string): void {
        // load json
        const mapAbsolutePath = Path.join(process.cwd(), mapRelativePath)

        let json: any
        try {
            json = JSON.parse(FS.readFileSync(mapAbsolutePath, 'utf8'))
        } catch (e) {
            throw new Error('error reading --sourcefile-url-map json file: ' + e.message)
        }

        // validate json
        if (!(json instanceof Array)) {
            throw new Error('--sourcefile-url-map json file has to have Array as root element')
        }

        this.mappings = []

        // validate & process json
        for (const mappingJson of json) {
            if (mappingJson instanceof Object && mappingJson.hasOwnProperty('pattern') && mappingJson.hasOwnProperty('replace') && typeof mappingJson['pattern'] === 'string' && typeof mappingJson['replace'] === 'string') {
                let regExp: RegExp | null = null

                try {
                    regExp = new RegExp(mappingJson['pattern']);
                } catch (e) {
                    throw new Error('error reading --sourcefile-url-map: ' + e.message)
                }

                this.mappings.push({
                    pattern: regExp as RegExp,
                    replace: (mappingJson['replace'] as string).replace("<branch_name>/", this.branchName),
                    onlyTitle: mappingJson['onlyTitle'] ? mappingJson : false
                })
            } else {
                throw new Error('--sourcefile-url-map json file syntax has to be: [{"pattern": "REGEX PATTERN STRING WITHOUT ENCLOSING SLASHES", replace: "STRING"}, ETC.]')
            }
        }
    }

    private onEndResolve(context: Context): void {
        if (this.mappings === undefined) {
            throw new Error('assertion fail')
        }

        const project = context.project;


        let reflection;
        let o;
        let n;
        for (let reflectionsKey in project.reflections) {
            reflection = project.reflections[reflectionsKey];
            if (reflection.sources) {
                for (let source of reflection.sources) {
                    for (const mapping of this.mappings) {
                        if (source) {
                            if (mapping.onlyTitle) {
                                o = source.fileName;
                                source.fileName = source.fileName.replace(mapping.pattern, mapping.replace)
                                n = source.fileName;
                            } else {
                                o = source.url;
                                source.url = (source.url ? source.url : source.fileName).replace(mapping.pattern, mapping.replace);
                                if (source.file && source.file.url) {
                                    source.url = source.file.url + '#L' + source.line
                                }
                                n = source.url
                            }
                            if (o != n)
                                break;
                        }
                    }
                }
            }
        }
    }
}
