import {
  ApolloLink,
  FetchResult,
  from,
  Observable,
  Operation,
} from "@apollo/client";
import {
  MockedProvider as ApolloMockedProvider,
  MockedResponse,
  MockLink,
} from "@apollo/client/testing";
import { FunctionComponent } from "react";

const wildcard = Symbol();
export const matchAny = () => wildcard;

interface MockedProviderProps {
  mocks: MockedResponse[];
  children: React.ReactNode;
}

// this should probably go on context...
const wildcardsByOperation = new Map<string, string[]>();

export const MockedProvider: FunctionComponent<MockedProviderProps> = ({
  children,
  mocks,
}: MockedProviderProps) => {
  const mocksWithWildcardsRemoved = mocks.map((mock) => {
    const { variables } = mock.request;
    if (!variables) return mock;

    const variablesWithWildcardsRemoved = removeWildcardsFromRequestVars(
      variables,
      getOperationName(mock)
    );
    mock.request.variables = variablesWithWildcardsRemoved;
    return mock;
  });

  return (
    <ApolloMockedProvider
      mocks={mocksWithWildcardsRemoved}
      addTypename={false}
      link={from([
        makeRemoveWildcardsLink(wildcardsByOperation),
        new ReusableMockLink(mocksWithWildcardsRemoved),
      ])}
    >
      {children}
    </ApolloMockedProvider>
  );
};

class ReusableMockLink extends MockLink {
  constructor(readonly mocks: MockedResponse[]) {
    super(mocks);
  }
  public request(
    operation: Operation
  ): Observable<
    FetchResult<Record<string, any>, Record<string, any>, Record<string, any>>
  > | null {
    const res = super.request(operation);
    const requestMock = this.mocks.find(
      (m) => getOperationName(m) === operation.operationName
    );
    if (requestMock) this.addMockedResponse(requestMock);
    return res;
  }
}

function makeRemoveWildcardsLink(matches: Map<string, string[]>) {
  return new ApolloLink((operation, forward) => {
    const removable = matches.get(operation.operationName);
    if (removable) {
      for (const key of removable) {
        delete operation.variables[key];
      }
    }
    return forward(operation);
  });
}

function getOperationName(mock: MockedResponse): string {
  const operationName = (mock.request.query.definitions[0] as any).name.value;
  if (!operationName) throw new Error("Request requires operation name!");
  return operationName;
}

function registerAsWildcard(operationName: string, key: string) {
  const storedMatches = wildcardsByOperation.get(operationName);
  storedMatches
    ? storedMatches.push(key)
    : wildcardsByOperation.set(operationName, [key]);
}

function removeWildcardsFromRequestVars(
  variables: Record<string, any>,
  operationName: string
): Record<string, any> {
  const requestVariableKeys = Object.keys(variables);
  const variablesWithWildcardsRemoved = requestVariableKeys.reduce(
    (nonWildcardVars: Record<string, any>, key: string) => {
      if (variables[key] === wildcard) {
        registerAsWildcard(operationName, key);
      } else {
        nonWildcardVars[key] = variables[key];
      }
      return nonWildcardVars;
    },
    {}
  );
  return variablesWithWildcardsRemoved;
}
