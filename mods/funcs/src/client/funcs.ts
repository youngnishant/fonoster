/*
 * Copyright (C) 2021 by Fonoster Inc (https://fonoster.com)
 * http://github.com/fonoster/fonos
 *
 * This file is part of Project Fonos
 *
 * Licensed under the MIT License (the "License");
 * you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *    https://opensource.org/licenses/MIT
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import Storage from "@fonos/storage";
import {FonosService, ServiceOptions} from "@fonos/core";
import {FuncsClient} from "../service/protos/funcs_grpc_pb";
import FuncsPB, {DeployStream} from "../service/protos/funcs_pb";
import CommonPB from "../service/protos/common_pb";
import {promisifyAll} from "grpc-promise";
import grpc from "grpc";
import {
  DeleteFuncRequest,
  DeleteFuncResponse,
  DeployFuncRequest,
  GetFuncRequest,
  GetFuncResponse,
  ListFuncsRequest,
  ListFuncsResponse
} from "../types";
import {buildDeployFuncRequest, cleanupTmpDir, copyFuncAtTmp} from "../utils";
import logger from "@fonos/logger";

/**
 * @classdesc Use Fonos Funcs, a capability of FaaS subsystem,
 * to deploy, update, get and delete functions. Fonos Funcs requires of a
 * running Fonos deployment and FaaS.
 *
 * @extends FonosService
 * @example
 *
 * const Fonos = require("@fonos/sdk");
 * const funcs = new Fonos.Funcs();
 *
 * const request = {
 *   name: "function1",
 *   baseImage: "docker.io/functions/function1:latest",
 *   limits: {
 *      cpu: 100m,
 *      memory: 40Mi
 *   },
 *   requests: {
 *      cpu: 100m,
 *      memory: 40Mi
 *   }
 * };
 *
 * funcs.deployFunc(request)
 * .then(result => {
 *   console.log(result)              // successful response
 * }).catch(e => console.error(e));   // an error occurred
 */
export default class Funcs extends FonosService {
  storage: any;
  /**
   * Constructs a new Funcs object.
   * @param {ServiceOptions} options - Options to indicate the objects endpoint
   * @see module:core:FonosService
   */
  constructor(options?: ServiceOptions) {
    super(FuncsClient, options);
    super.init(grpc);
    //promisifyAll(super.getService(), ['getFunc', 'listFunc', 'deleteFunc'], { metadata: super.getMeta() });
    this.storage = new Storage(super.getOptions());
  }

  /**
   * Creates or updates a function in the FaaS subsystem.
   *
   * @param {DeployFuncRequest} request - Request to create or update a function
   * @param {string} request.name - Unique function name
   * @param {string} request.baseImage - The image base to create the function
   * @param {string} request.pathToFunc - Optional path to the function. If none is provided, then the base image will be
   * used to deploy the function
   * @param {string} request.limit.memory - Optional limit for function's memory utilization
   * @param {string} request.limit.cpu - Optional limit for function's cpu utilization
   * @param {string} request.requests.memory - Optional requested memory allocation for the function
   * @param {string} request.requests.cpu - Optional requested cpu allocation for the function
   * @param {Function(string)} emitter - Optional callback to capture deployment events
   * @return {Promise<DeployFuncResponse>}
   * @example
   *
   * const request = {
   *   name: "function1",
   *   baseImage: "docker.io/functions/function1",
   * };
   *
   * funcs.deployFunc(request, callback)
   * .then(result => {
   *   console.log(result)              // successful response
   * }).catch(e => console.error(e));   // an error occurred
   */
  async deployFunc(
    request: DeployFuncRequest,
    emitter?: Function
  ): Promise<void> {
    if (request.pathToFunc) {
      cleanupTmpDir(request.name);
      await copyFuncAtTmp(request.pathToFunc, request.name);
      await this.storage.uploadObject({
        filename: `/tmp/${request.name}.tgz`,
        bucket: "funcs"
      });
    }

    return new Promise<void>((resolve, reject) => {
      const req = buildDeployFuncRequest(request);
      const stream = super.getService().deployFunc(req, super.getMeta());
      stream.on("data", (message: any) => {
        if (emitter) emitter(message);
      });
      stream.on("end", () => {
        resolve();
      });
      stream.on("error", (e: any) => {
        reject(e);
      });
    });
  }

  /**
   * Gets a system function by name.
   *
   * @param {GetFuncRequest} request - Request to get a function
   * @param {string} request.name - Unique function name
   * @return {Promise<GetFuncResponse>}
   * @example
   *
   * const request = {
   *   name: "function1"
   * };
   *
   * funcs.getFunc(request)
   * .then(result => {
   *   console.log(result)              // successful response with the function as the body65
   * }).catch(e => console.error(e));   // an error occurred
   */
  async getFunc(request: GetFuncRequest): Promise<GetFuncResponse> {
    return new Promise((resolve, reject) => {
      const req = new FuncsPB.GetFuncRequest();
      req.setName(request.name);
      super.getService().getFunc(req, (e, res: FuncsPB.Func) => {
        if (e) reject(e);

        resolve({
          name: res.getName(),
          image: res.getImage(),
          invocationCount: res.getInvocationCount(),
          replicas: res.getReplicas(),
          availableReplicas: res.getAvailableReplicas()
        });
      });
    });
  }

  /**
   * Removes a function by its name.
   *
   * @param {DeleteFuncRequest} request - Request to delete a function
   * @param {string} request.name - Unique function name
   * @return {Promise<GetFuncResponse>}
   * @note This action will remove all function statistics.
   * @example
   *
   * const request = {
   *   name: "function1"
   * };
   *
   * funcs.deleteFunc(request)
   * .then(result => {
   *   console.log(result)              // returns the name of the function
   * }).catch(e => console.error(e));   // an error occurred
   */
  async deleteFunc(request: DeleteFuncRequest): Promise<DeleteFuncResponse> {
    return new Promise((resolve, reject) => {
      const req = new FuncsPB.DeleteFuncRequest();
      req.setName(request.name);
      super.getService().deleteFunc(req, (e: any) => {
        if (e) reject(e);

        resolve({
          name: request.name
        });
      });
    });
  }

  /**
   * Returns a list of functions owned by the User.
   *
   * @param {ListFuncsRequest} request
   * @param {number} request.pageSize - Number of element per page
   * (defaults to 20)
   * @param {string} request.pageToken - The next_page_token value returned from
   * a previous List request, if any
   * @return {Promise<ListFuncsResponse>} List of Functions
   * @example
   *
   * const request = {
   *    pageSize: 20,
   *    pageToken: 2
   * };
   *
   * funcs.listFuncs(request)
   * .then(() => {
   *   console.log(result)             // returns a ListFuncsResponse object
   * }).catch(e => console.error(e));  // an error occurred
   */
  async listFuncs(request: ListFuncsRequest): Promise<ListFuncsResponse> {
    return new Promise((resolve, reject) => {
      const req = new FuncsPB.ListFuncsRequest();
      req.setPageSize(request.pageSize);
      req.setPageToken(request.pageToken);
      req.setView(request.view);
      super
        .getService()
        .listFuncs(req, (e: any, paginatedList: FuncsPB.ListFuncsResponse) => {
          if (e) reject(e);

          resolve({
            nextPageToken: paginatedList.getNextPageToken(),
            funcs: paginatedList.getFuncsList().map((f: FuncsPB.Func) => {
              return {
                name: f.getName(),
                image: f.getImage(),
                replicas: f.getReplicas(),
                invocationCount: f.getInvocationCount(),
                availableReplicas: f.getAvailableReplicas()
              };
            })
          });
        });
    });
  }
}

export {FuncsPB, CommonPB, buildDeployFuncRequest};